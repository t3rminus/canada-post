'use strict';

const _ = require('lodash'),
	Bluebird = require('bluebird'),
	URL = require('url').Url,
	pr = require('request-promise'),
	prErrors = require('request-promise/errors'),
	xml2js = require('xml2js'),
	parser = new xml2js.Parser({explicitArray: false }),
	parseXML = Bluebird.promisify(parser.parseString, { context: parser });

class CanadaPostError extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
		Error.captureStackTrace(this, CanadaPostError)
	}
}

class CanadaPostClient {
	constructor(userId, password, customer, lang) {
		this.endpoint = process.env.NODE_ENV === 'production' ? CanadaPostClient.ENDPOINT : CanadaPostClient.ENDPOINT_DEV;
		this.auth = Buffer.from(`${userId}:${password}`,'utf8').toString('base64');
		this.customer = customer;
		this.lang = lang || 'en-CA';
	}

	_request(call, params, path, method, accept, contentType) {
		method = method || 'GET';

		const reqUrl = new URL();
		reqUrl.hostname = this.endpoint;
		reqUrl.protocol = 'https:';
		if(path) {
			reqUrl.pathname = `/${path}/${call}`;
		} else if(this.customer) {
			reqUrl.pathname = `/rs/${this.customer}/${call}`;
		} else {
			reqUrl.pathname = `/${call}`;
		}

		return Bluebird.try(() => {
			if(!pr[method.toLowerCase()]) {
				throw new Error(`Invalid method ${method}. Should be one of GET,POST,HEAD,etc.`);
			}

			const reqParams = {
				method,
				headers: {
					'Accept': accept || contentType,
					'Content-Type': contentType || accept,
					'Authorization': `Basic ${this.auth}`,
					'Accept-language': this.lang
				}
			};

			if(params && method === 'GET') {
				reqUrl.query = params;
			} else if(params) {
				const builder = new xml2js.Builder();
				reqParams.body = builder.buildObject(CanadaPostClient.normalizeObject(params, true));
			}

			reqParams.url = reqUrl.format();

			return pr(reqParams)
				.then(result => parseXML(result))
				.then(result => {
					if(result && result.messages && result.messages.message) {
						throw new CanadaPostError(result.messages.message.description, result.messages.message.code);
					}
					return result;
				})
				.catch(prErrors.StatusCodeError, error => {
					return parseXML(error.response.body)
						.then(response => {
							response = response && response.messages && response.messages.message;
							if(response.description && response.code) {
								throw new CanadaPostError(response.description, response.code);
							}

							throw error;
						});
				});
		});
	}

	discoverServices(originPostalCode, destinationCountry, destinationPostalCode) {
		const request = {
			origpc: originPostalCode,
			country: destinationCountry
		};

		if(destinationPostalCode) {
			request.destpc = destinationPostalCode;
		}

		return this._request('service', request, 'rs/ship', 'GET', 'application/vnd.cpc.ship.rate-v3+xml')
		.then((result) => {
			if(result && result.services && result.services.service && Array.isArray(result.services.service)) {
				result = result.services.service;
				return result.map(r => ({
					serviceCode: r['service-code'],
					serviceName: r['service-name']
				}));
			}
			throw new Error('Response was in an unknown format.');
		});
	}

	getRates(scenario) {
		scenario['$'] = {
			xmlns: 'http://www.canadapost.ca/ws/ship/rate-v3'
		};
		if(this.customer) {
			scenario.customerNumber = this.customer;
		}

		const request = {
			mailingScenario: scenario
		};
		return this._request('price', request, 'rs/ship', 'POST', 'application/vnd.cpc.ship.rate-v3+xml')
			.then((result) => CanadaPostClient.normalizeObject(result, false, true))
			.then((result) => {
				if (result && result.priceQuotes && result.priceQuotes.priceQuote && Array.isArray(result.priceQuotes.priceQuote)) {
					result = result.priceQuotes.priceQuote;
					return result.map(r => {
						delete r.serviceLink;
						r.priceDetails.adjustments = r.priceDetails.adjustments.adjustment;
						r.priceDetails.options = r.priceDetails.options.option;

						return r;
					});
				}
				throw new Error('Response was in an unknown format.');
			});
	}

	createNonContractShipment(shipment) {
		shipment['$'] = {
			xmlns: 'http://www.canadapost.ca/ws/ncshipment-v4'
		};

		const request = {
			nonContractShipment: shipment
		};

		return this._request('ncshipment', request, null, 'POST', 'application/vnd.cpc.ncshipment-v4+xml')
		.then((result) => CanadaPostClient.normalizeObject(result, false, false))
		.then((result) => {
			if(result && result.nonContractShipmentInfo) {
				result = result.nonContractShipmentInfo;

				const normalizedResult = {
					shipmentId: result.shipmentId,
					trackingPin: result.trackingPin,
					links: {}
				};

				if (result && result.links && result.links.link && result.links.link.length) {
					const hasMultipleLabels = result.links.link.filter(l => l.$.rel === 'label').length > 1;
					result.links.link.forEach(l => {
						if(l.$.rel === 'label' && hasMultipleLabels) {
							normalizedResult.links.label = normalizedResult.links.label || [];
							normalizedResult.links.label[+l.$.index] = l.$.href;
						} else {
							normalizedResult.links[l.$.rel] = l.$.href
						}
					});
				}

				return normalizedResult;
			}

			throw new Error('Response was in an unknown format.');
		});
	}

	getTrackingSummary(pin, type) {
		type = type || 'pin';
		if(['pin','ref','dnc'].indexOf(type) < 0) {
			throw new Error('Unknown tracking format. Should be one of pin, ref, dnc');
		}
		let request = null;
		if(type === 'ref') {
			request = pin;
			pin = 'summary';
		} else {
			pin = `${pin}/summary`;
		}

		return this._request(`${type}/${pin}`, request, 'vis/track', 'GET', 'application/vnd.cpc.track+xml')
		.then((result) => CanadaPostClient.normalizeObject(result, false, true))
		.then((result) => {
			if (result && result.trackingSummary && result.trackingSummary.pinSummary) {
				result = result.trackingSummary.pinSummary;

				return result;
			}
			throw new Error('Response was in an unknown format.');
		});
	}

	getTrackingDetail(pin, type) {
		type = type || 'pin';
		if (['pin', 'dnc'].indexOf(type) < 0) {
			throw new Error('Unknown tracking format. Should be one of pin, dnc');
		}

		return this._request(`${type}/${pin}/detail`, null, 'vis/track', 'GET', 'application/vnd.cpc.track+xml')
		.then((result) => CanadaPostClient.normalizeObject(result, false, true))
		.then((result) => {
			if (result && result.trackingDetail && result.trackingDetail) {
				result = result.trackingDetail;
				if(result.deliveryOptions && result.deliveryOptions.item && result.deliveryOptions.item.length) {
					result.deliveryOptions = result.deliveryOptions.item.reduce((a,i) => {
						if(i.deliveryOption && i.deliveryOptionDescription) {
							a.push({
								option: i.deliveryOption,
								description: i.deliveryOptionDescription
							});
						}
						return a;
					}, []);
				}
				if (result.significantEvents && result.significantEvents.occurrence
					&& result.significantEvents.occurrence.length) {
					result.significantEvents = result.significantEvents.occurrence.reduce((a, i) => {
						a.push(i);
						return a;
					}, []);
				}
				return result;
			}
			throw new Error('Response was in an unknown format.');
		});
	}

	getShipments(from, to) {
		const params = { from: CanadaPostClient.formatDate(new Date(from)) };
		if(to) {
			params.to = CanadaPostClient.formatDate(new Date(to));
		}

		return this._request(`ncshipment`, params, null, 'GET', 'application/vnd.cpc.ncshipment-v4+xml')
		.then((result) => {
			if(result['non-contract-shipments'] && result['non-contract-shipments'].link) {
				return result['non-contract-shipments'].link.map((link) => {
					const id = /ncshipment\/([0-9]+)/.exec(link.$.href);
					if(!id[1]) {
						return null;
					}
					return {
						shipmentId: id[1],
						href: link.$.href,
						mediaType: link.$['media-type'],
						rel: link.$.rel
					}
				}).filter((i) => i !== null);
			}
			throw new Error('Response was in an unknown format.');
		});
	}

	getShipment(id) {
		return this._request(`ncshipment/${id}`, null, null, 'GET', 'application/vnd.cpc.ncshipment-v4+xml')
		.then((result) => CanadaPostClient.normalizeObject(result, false, false))
		.then(result => {
			if(result && result.nonContractShipmentInfo) {
				result = result.nonContractShipmentInfo;

				const normalizedResult = {
					shipmentId: result.shipmentId,
					trackingPin: result.trackingPin,
					links: {}
				};

				if (result && result.links && result.links.link && result.links.link.length) {
					const hasMultipleLabels = result.links.link.filter(l => l.$.rel === 'label').length > 1;
					result.links.link.forEach(l => {
						if(l.$.rel === 'label' && hasMultipleLabels) {
							normalizedResult.links.label = normalizedResult.links.label || [];
							normalizedResult.links.label[+l.$.index] = l.$.href;
						} else {
							normalizedResult.links[l.$.rel] = l.$.href
						}
					});
				}

				return normalizedResult;
			}

			throw new Error('Response was in an unknown format.');
		});
	}

	getShipmentDetails(id) {
		return this._request(`ncshipment/${id}/details`, null, null, 'GET', 'application/vnd.cpc.ncshipment-v4+xml')
			.then((result) => CanadaPostClient.normalizeObject(result, false, true));
	}

	static normalizeObject(obj, kebab, ignoreAttrs) {
		if((!Array.isArray(obj) && typeof obj !== 'object') || obj === null) {
			return obj;
		}
		if(Array.isArray(obj)) {
			return obj.map(o => CanadaPostClient.normalizeObject(o, kebab, ignoreAttrs));
		} else {
			let out = {};
			const keys = Object.keys(obj);
			keys.forEach(key => {
				if(key === '_' && (keys.length === 1 || (keys.length === 2 && obj['$'] && ignoreAttrs))) {
					out = obj._;
				} else if (key !== '$') {
					const newKey = kebab ? _.kebabCase(key) : _.camelCase(key);
					out[newKey] = CanadaPostClient.normalizeObject(obj[key], kebab, ignoreAttrs);
				} else if(!ignoreAttrs) {
					out[key] = obj[key];
				}
			});
			return out;
		}
	}

	static formatDate(date) {
		const pad = (num) => num >= 10 ? `${num}` : `0${num}`;
		return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`
	}

}

CanadaPostClient.ENDPOINT = 'soa-gw.canadapost.ca';
CanadaPostClient.ENDPOINT_DEV = 'ct.soa-gw.canadapost.ca';

CanadaPostClient.CanadaPostError = CanadaPostError;

module.exports = CanadaPostClient;
