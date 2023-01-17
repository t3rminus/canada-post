export = CanadaPostClient;
declare class CanadaPostClient {
  static normalizeObject(obj: any, kebab: any, ignoreAttrs: any): any;
  static formatDate(date: any): string;
  static setNamespace(obj: any, xmlns: any): any;
  static checkResultFormat(result: any, path: any, and: any): void;
  constructor(
    userId: any,
    password: any,
    customer: any,
    lang: any,
    useTestEndpoint: any
  );
  endpoint: string;
  auth: any;
  customer: any;
  lang: any;
  _request(
    call: any,
    params: any,
    contentType: any,
    path?: any,
    method?: string
  ): Promise<any>;
  _rawRequest(method: any, url: any, contentType: any, body: any): Promise<any>;
  discoverServices(
    originPostalCode: any,
    destinationCountry: any,
    destinationPostalCode: any
  ): Promise<any>;
  getRates(scenario: any): Promise<any>;
  createNonContractShipment(shipment: any): Promise<{
    shipmentId: any;
    trackingPin: any;
    links: {};
  }>;
  refundNonContractShipment(
    id: any,
    email: any
  ): Promise<{
    serviceTicketId: any;
    serviceTicketDate: any;
  }>;
  getTrackingSummary(pin: any, type: any): Promise<any>;
  getTrackingDetail(pin: any, type: any): Promise<any>;
  getShipments(from: any, to: any): Promise<any>;
  getShipment(id: any): Promise<{
    shipmentId: any;
    trackingPin: any;
    links: {};
  }>;
  getShipmentDetails(id: any): Promise<any>;
}
declare namespace CanadaPostClient {
  export const ENDPOINT: string;
  export const ENDPOINT_DEV: string;
  export { CanadaPostError };
}
declare class CanadaPostError extends Error {
  constructor(message: any, code: any);
  code: any;
  originalMessages: any;
}

declare module "canadapost-api";
