'use strict';

const kebabCase = require('lodash.kebabcase');
const camelCase = require('lodash.camelcase');
const URL = require('url').Url;
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false });

const parseXML = (string, opts) => {
  return new Promise((resolve, reject) => {
    const cb = (err, res) => err ? reject(err) : resolve(res);
    parser.parseString(string, opts || cb, cb);
  });
};

const get = (obj, path, def) => {
  try {
    const val = path.replace(/(^[.[\]\s]+|[.[\]\s]+$)/g, '').split(/[.[\]]/).reduce((a, p) => a[p], obj);
    return val === undefined ? def : val;
  } catch (err) {
    return def;
  }
};

const normalizeArray = (val) => {
  if (Array.isArray(val)) {
    return val;
  } else if (val) {
    return [val];
  } else {
    return [];
  }
};

class CanadaPostError extends Error {
  constructor (message, code) {
    let finalMessage = message;
    let finalCode = code;
    let originalMessages = message;
    if(Array.isArray(message)) {
      // Handle case where we passed an array of Canada Post messages
      finalMessage = message.map(m => `${m.description} - (code ${m.code})`).join('\n');
      finalCode = message.map(m => `${m.code}`).join(',');
    } else if(message.description && message.code) {
      // Handle case where we passed a single Canada Post messaeg
      finalMessage = message.description;
      finalCode = message.code;
      originalMessages = [message];
    } else {
      // Handle case where we passed a string (and code?)
      originalMessages = [];
    }
    super(finalMessage);
    this.code = finalCode;
    this.originalMessages = originalMessages;
    Error.captureStackTrace(this, CanadaPostError);
  }
}

class CanadaPostClient {
  constructor (userId, password, customer, lang, useTestEndpoint) {
    if (useTestEndpoint === true) {
      this.endpoint = CanadaPostClient.ENDPOINT_DEV;
    } else if (useTestEndpoint === false) {
      this.endpoint = CanadaPostClient.ENDPOINT;
    } else {
      this.endpoint = process.env.NODE_ENV === 'production' ? CanadaPostClient.ENDPOINT : CanadaPostClient.ENDPOINT_DEV;
    }

    this.auth = Buffer.from(`${userId}:${password}`, 'utf8').toString('base64');
    this.customer = customer;
    this.lang = lang || 'en-CA';
  }

  async _request (call, params, contentType, path = null, method = 'GET') {
    // Set-up the URL & Parameters
    const reqUrl = new URL();
    reqUrl.hostname = this.endpoint;
    reqUrl.protocol = 'https:';

    if (path) {
      reqUrl.pathname = `/${path}/${call}`;
    } else if (this.customer) {
      reqUrl.pathname = `/rs/${this.customer}/${call}`;
    } else {
      reqUrl.pathname = `/${call}`;
    }

    let body;
    if (params && method === 'GET') {
      reqUrl.query = params;
    } else if (params) {
      const builder = new xml2js.Builder();
      body = builder.buildObject(CanadaPostClient.normalizeObject(params, true));
    }

    return this._rawRequest(method, reqUrl.format(), contentType, body);
  }

  async _rawRequest (method, url, contentType, body) {
    // Set-up the request
    const reqParams = {
      method,
      body,
      headers: {
        Accept: contentType,
        'Content-Type': contentType,
        Authorization: `Basic ${this.auth}`,
        'Accept-language': this.lang
      }
    };

    // Perform the request
    const rawResult = await fetch(url, reqParams);
    const result = await parseXML(await rawResult.text());

    // We got a response, but Canada Post indicates an error
    if (result && result.messages && result.messages.message) {
      // Parsing errors handled in CanadaPostError constructor
      throw new CanadaPostError(result.messages.message);
    }

    // No error? Let's return that.
    return result;
  }

  async discoverServices (originPostalCode, destinationCountry, destinationPostalCode) {
    const request = {
      origpc: originPostalCode,
      country: destinationCountry
    };

    if (destinationPostalCode) {
      request.destpc = destinationPostalCode;
    }

    const result = await this._request('service', request, 'application/vnd.cpc.ship.rate-v3+xml', 'rs/ship');

    CanadaPostClient.checkResultFormat(result, 'services.service', Array.isArray(result.services.service));

    return get(result, 'services.service', []).map(r => ({
      serviceCode: r['service-code'],
      serviceName: r['service-name']
    }));
  }

  async getRates (scenario) {
    const mailingScenario = CanadaPostClient.setNamespace(scenario, 'http://www.canadapost.ca/ws/ship/rate-v3');

    if (this.customer) {
      mailingScenario.customerNumber = this.customer;
    }

    let result = await this._request('price', { mailingScenario }, 'application/vnd.cpc.ship.rate-v3+xml', 'rs/ship', 'POST');
    result = CanadaPostClient.normalizeObject(result, false, true);

    CanadaPostClient.checkResultFormat(result, 'priceQuotes.priceQuote', Array.isArray(result.priceQuotes.priceQuote));

    result = result.priceQuotes.priceQuote;
    return result.map(r => {
      delete r.serviceLink;
      r.priceDetails.adjustments = normalizeArray(r.priceDetails.adjustments && r.priceDetails.adjustments.adjustment);
      r.priceDetails.options = normalizeArray(r.priceDetails.options && r.priceDetails.options.option);
      return r;
    });
  }

  async createNonContractShipment (shipment) {
    const nonContractShipment = CanadaPostClient.setNamespace(shipment, 'http://www.canadapost.ca/ws/ncshipment-v4');

    let result = await this._request('ncshipment', { nonContractShipment }, 'application/vnd.cpc.ncshipment-v4+xml', null, 'POST');
    result = CanadaPostClient.normalizeObject(result, false, false);

    CanadaPostClient.checkResultFormat(result, 'nonContractShipmentInfo');

    result = result.nonContractShipmentInfo;

    const normalizedResult = {
      shipmentId: result.shipmentId,
      trackingPin: result.trackingPin,
      links: {}
    };

    if (result && result.links && result.links.link && result.links.link.length) {
      const hasMultipleLabels = result.links.link.filter(l => l.$.rel === 'label').length > 1;
      result.links.link.forEach(l => {
        if (l.$.rel === 'label' && hasMultipleLabels) {
          normalizedResult.links.label = normalizedResult.links.label || [];
          normalizedResult.links.label[+l.$.index] = l.$.href;
        } else {
          normalizedResult.links[l.$.rel] = l.$.href;
        }
      });
    }

    return normalizedResult;
  }

  async refundNonContractShipment (id, email) {
    const shipment = await this.getShipment(id);
    if (!shipment || !shipment.links.refund) {
      throw new Error('That shipment was not found, or had no refund link.');
    }

    const nonContractShipmentRefundRequest = CanadaPostClient.setNamespace({ email }, 'http://www.canadapost.ca/ws/ncshipment-v4');
    const builder = new xml2js.Builder();
    const body = builder.buildObject(CanadaPostClient.normalizeObject({ nonContractShipmentRefundRequest }, true));

    let result = await this._rawRequest('POST', shipment.links.refund, 'application/vnd.cpc.ncshipment-v4+xml', body);
    result = CanadaPostClient.normalizeObject(result, false, false);

    CanadaPostClient.checkResultFormat(result, 'nonContractShipmentRefundRequestInfo');

    result = result.nonContractShipmentRefundRequestInfo;

    return {
      serviceTicketId: result.serviceTicketId,
      serviceTicketDate: result.serviceTicketDate
    };
  }

  async getTrackingSummary (pin, type) {
    type = type || 'pin';
    if (['pin', 'ref', 'dnc'].indexOf(type) < 0) {
      throw new Error('Unknown tracking format. Should be one of pin, ref, dnc');
    }
    let request = null;
    if (type === 'ref') {
      request = pin;
      pin = 'summary';
    } else {
      pin = `${pin}/summary`;
    }

    let result = await this._request(`${type}/${pin}`, request, 'application/vnd.cpc.track+xml', 'vis/track');
    result = CanadaPostClient.normalizeObject(result, false, true);

    CanadaPostClient.checkResultFormat(result, 'trackingSummary.pinSummary');

    result = result.trackingSummary.pinSummary;

    return result;
  }

  async getTrackingDetail (pin, type) {
    type = type || 'pin';
    if (['pin', 'dnc'].indexOf(type) < 0) {
      throw new Error('Unknown tracking format. Should be one of pin, dnc');
    }

    let result = await this._request(`${type}/${pin}/detail`, null, 'application/vnd.cpc.track+xml', 'vis/track');
    result = CanadaPostClient.normalizeObject(result, false, true);

    CanadaPostClient.checkResultFormat(result, 'trackingDetail');

    result = result.trackingDetail;
    if (result.deliveryOptions && result.deliveryOptions.item && result.deliveryOptions.item.length) {
      result.deliveryOptions = result.deliveryOptions.item.reduce((a, i) => {
        if (i.deliveryOption && i.deliveryOptionDescription) {
          a.push({
            option: i.deliveryOption,
            description: i.deliveryOptionDescription
          });
        }
        return a;
      }, []);
    }
    if (result.significantEvents && result.significantEvents.occurrence && result.significantEvents.occurrence.length) {
      result.significantEvents = result.significantEvents.occurrence.reduce((a, i) => {
        a.push(i);
        return a;
      }, []);
    }
    return result;
  }

  async getShipments (from, to) {
    const params = { from: CanadaPostClient.formatDate(new Date(from)) };
    if (to) {
      params.to = CanadaPostClient.formatDate(new Date(to));
    }

    let result = await this._request('ncshipment', params, 'application/vnd.cpc.ncshipment-v4+xml');
    result = CanadaPostClient.normalizeObject(result, false, false);
    CanadaPostClient.checkResultFormat(result, 'nonContractShipments');

    if (Array.isArray(result.nonContractShipments.link)) {
      return result.nonContractShipments.link.map((link) => {
        const id = /ncshipment\/([0-9]+)/.exec(link.$.href);
        if (!id[1]) {
          return null;
        }
        return {
          shipmentId: id[1],
          href: link.$.href,
          mediaType: link.$['media-type'],
          rel: link.$.rel
        };
      }).filter((i) => i !== null);
    } else if (result.nonContractShipments.link && result.nonContractShipments.link.$) {
      // Only one, so it becomes an object
      const link = result.nonContractShipments.link;
      const id = /ncshipment\/([0-9]+)/.exec(link.$.href);
      if (!id[1]) {
        return [];
      }
      return [{
        shipmentId: id[1],
        href: link.$.href,
        mediaType: link.$['media-type'],
        rel: link.$.rel
      }];
    }

    return [];
  }

  async getShipment (id) {
    let result = await this._request(`ncshipment/${id}`, null, 'application/vnd.cpc.ncshipment-v4+xml');
    result = CanadaPostClient.normalizeObject(result, false, false);

    CanadaPostClient.checkResultFormat(result, 'nonContractShipmentInfo');

    result = result.nonContractShipmentInfo;

    const normalizedResult = {
      shipmentId: result.shipmentId,
      trackingPin: result.trackingPin,
      links: {}
    };

    if (result && result.links && result.links.link && result.links.link.length) {
      const hasMultipleLabels = result.links.link.filter(l => l.$.rel === 'label').length > 1;
      result.links.link.forEach(l => {
        if (l.$.rel === 'label' && hasMultipleLabels) {
          normalizedResult.links.label = normalizedResult.links.label || [];
          normalizedResult.links.label[+l.$.index] = l.$.href;
        } else {
          normalizedResult.links[l.$.rel] = l.$.href;
        }
      });
    }

    return normalizedResult;
  }

  async getShipmentDetails (id) {
    const result = await this._request(`ncshipment/${id}/details`, null, 'application/vnd.cpc.ncshipment-v4+xml');
    return CanadaPostClient.normalizeObject(result, false, true);
  }

  static normalizeObject (obj, kebab, ignoreAttrs) {
    if ((!Array.isArray(obj) && typeof obj !== 'object') || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(o => CanadaPostClient.normalizeObject(o, kebab, ignoreAttrs));
    } else {
      let out = {};
      const keys = Object.keys(obj);
      keys.forEach(key => {
        if (key === '_' && (keys.length === 1 || (keys.length === 2 && obj.$ && ignoreAttrs))) {
          out = obj._;
        } else if (key !== '$') {
          const newKey = kebab ? kebabCase(key) : camelCase(key);
          out[newKey] = CanadaPostClient.normalizeObject(obj[key], kebab, ignoreAttrs);
        } else if (!ignoreAttrs) {
          out[key] = obj[key];
        }
      });
      return out;
    }
  }

  static formatDate (date) {
    const pad = (num) => num >= 10 ? `${num}` : `0${num}`;
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  static setNamespace (obj, xmlns) {
    return Object.assign({}, obj, { $: { xmlns } });
  }

  static checkResultFormat (result, path, and) {
    if (get(result, path, undefined) === undefined || and === false) {
      throw new Error(`Response was in an unknown format. Expected: ${path}, found ${JSON.stringify(result, null, 4)}`);
    }
  }
}

CanadaPostClient.ENDPOINT = 'soa-gw.canadapost.ca';
CanadaPostClient.ENDPOINT_DEV = 'ct.soa-gw.canadapost.ca';

CanadaPostClient.CanadaPostError = CanadaPostError;

module.exports = CanadaPostClient;
