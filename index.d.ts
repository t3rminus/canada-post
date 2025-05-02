/**
 * Canada Post API type definitions
 */
export declare namespace CanadaPost {
  /** 
   * Represents a Canada Post shipping service
   */
  export interface Service {
    /** The unique code identifying the service */
    serviceCode: string;
    /** The human-readable name of the service */
    serviceName: string;
  }

  export interface PriceDetails {
    /** Base price before adjustments */
    base: string;
    /** Array of applicable taxes */
    taxes: unknown[];
    /** Array of price adjustments */
    adjustments: unknown[];
    /** Array of optional services and their costs */
    options: unknown[];
    /** Final amount due */
    due: string;
  }

  /**
   * Represents a price quote for a shipping service
   */
  export interface PriceQuote {
    /** The unique code identifying the service */
    serviceCode: string;
    /** The human-readable name of the service */
    serviceName: string;
    /** Detailed breakdown of the price quote */
    priceDetails: PriceDetails;
  }

  /**
   * Links associated with a non-contract shipment
   */
  export interface NonContractShipmentLinks {
    /** Map of link relations to URLs */
    [rel: string]: string | string[];
  }

  /**
   * Information about a non-contract shipment
   */
  export interface NonContractShipmentInfo {
    /** Unique identifier for the shipment */
    shipmentId: string;
    /** Tracking PIN for the shipment */
    trackingPin: string;
    /** Associated links for various shipment operations */
    links: NonContractShipmentLinks;
  }

  /**
   * Response from a refund request
   */
  export interface RefundResponse {
    /** Unique identifier for the service ticket */
    serviceTicketId: string;
    /** Date the service ticket was created */
    serviceTicketDate: string;
  }

  /**
   * Link information for a shipment
   */
  export interface ShipmentLink {
    /** Unique identifier for the shipment */
    shipmentId: string;
    /** URL for the shipment resource */
    href: string;
    /** Media type of the resource */
    mediaType: string;
    /** Relationship type of the link */
    rel: string;
  }

  /**
   * Summary tracking information
   */
  export interface TrackingSummary {
    /** Tracking PIN */
    pin: string;
    /** Summary of the tracking status */
    summary: string;
  }

  export interface DeliveryOption {
    /** The human-readable name of the delivery option */
    description: string;
    /** The code identifying the delivery option */
    option: string;
  }

  /**
   * Detailed tracking information
   */
  export interface TrackingDetail {
    /** Available delivery options */
    deliveryOptions?: DeliveryOption[];
    /** Significant tracking events */
    significantEvents?: Array<unknown>;
  }

  /**
   * Represents a mailing scenario for rate calculations
   */
  export type MailingScenario = Record<string, unknown>;
}

/**
 * Client for interacting with the Canada Post API
 */
export declare class CanadaPostClient {
  /**
   * Normalizes an object's keys to either camelCase or kebab-case
   * @param obj - Object to normalize
   * @param kebab - Whether to use kebab-case (true) or camelCase (false)
   * @param ignoreAttrs - Whether to ignore XML attributes
   */
  static normalizeObject(obj: object, kebab: boolean, ignoreAttrs: boolean): object;

  /**
   * Formats a date into the required Canada Post format (YYYYMMDDHHmm)
   * @param date - Date to format
   */
  static formatDate(date: Date): string;

  /**
   * Sets XML namespace on an object
   * @param obj - Object to set namespace on
   * @param xmlns - XML namespace to set
   */
  static setNamespace(obj: object, xmlns: string): object;

  /**
   * Validates the format of an API response
   * @param result - API response to check
   * @param path - Expected path in the response
   * @param and - Additional condition that must be true
   */
  static checkResultFormat(result: object, path: string, and: boolean): void;

  /**
   * Creates a new Canada Post API client
   * @param userId - Canada Post API user ID
   * @param password - Canada Post API password
   * @param customer - Customer number
   * @param lang - Language for responses (default: en-CA)
   * @param useTestEndpoint - Whether to use the test endpoint. Defaults to false if NODE_ENV is 'production'.
   */
  constructor(
    userId: string,
    password: string,
    customer: string,
    lang: string,
    useTestEndpoint?: boolean
  );

  /** API endpoint URL */
  endpoint: string;
  /** Base64 encoded authentication string */
  auth: string;
  /** Customer number */
  customer: string;
  /** Response language */
  lang: string;

  /**
   * Makes a request to the Canada Post API
   * @param call - API endpoint to call
   * @param params - Request parameters
   * @param contentType - Content type for the request
   * @param path - Optional path prefix
   * @param method - HTTP method (default: GET)
   */
  _request(
    call: string,
    params: object | null,
    contentType: string,
    path?: string | null,
    method?: string
  ): Promise<object>;

  /**
   * Makes a raw HTTP request to the Canada Post API
   * @param method - HTTP method
   * @param url - Request URL
   * @param contentType - Content type for the request
   * @param body - Request body
   */
  _rawRequest(method: string, url: string, contentType: string, body: string | undefined): Promise<object>;

  /**
   * Gets available shipping services
   * @param originPostalCode - Origin postal code
   * @param destinationCountry - Destination country
   * @param destinationPostalCode - Optional destination postal code
   */
  discoverServices(
    originPostalCode: string,
    destinationCountry: string,
    destinationPostalCode?: string
  ): Promise<CanadaPost.Service[]>;

  /**
   * Gets shipping rates for a mailing scenario
   * @param scenario - Mailing scenario details
   */
  getRates(scenario: CanadaPost.MailingScenario): Promise<CanadaPost.PriceQuote[]>;

  /**
   * Creates a non-contract shipment
   * @param shipment - Shipment details
   */
  createNonContractShipment(shipment: object): Promise<CanadaPost.NonContractShipmentInfo>;

  /**
   * Requests a refund for a non-contract shipment
   * @param id - Shipment ID
   * @param email - Email address for refund notification
   */
  refundNonContractShipment(
    id: string,
    email: string
  ): Promise<CanadaPost.RefundResponse>;

  /**
   * Gets tracking summary for a shipment
   * @param pin - Tracking PIN
   * @param type - Type of tracking identifier (pin, ref, or dnc)
   */
  getTrackingSummary(pin: string, type?: string): Promise<CanadaPost.TrackingSummary>;

  /**
   * Gets detailed tracking information for a shipment
   * @param pin - Tracking PIN
   * @param type - Type of tracking identifier (pin or dnc)
   */
  getTrackingDetail(pin: string, type?: string): Promise<CanadaPost.TrackingDetail>;

  /**
   * Gets a list of shipments within a date range
   * @param from - Start date
   * @param to - Optional end date
   */
  getShipments(from: string | Date, to?: string | Date): Promise<CanadaPost.ShipmentLink[]>;

  /**
   * Gets information about a specific shipment
   * @param id - Shipment ID
   */
  getShipment(id: string): Promise<CanadaPost.NonContractShipmentInfo>;

  /**
   * Gets detailed information about a specific shipment
   * @param id - Shipment ID
   */
  getShipmentDetails(id: string): Promise<object>;
}

export declare namespace CanadaPostClient {
  /** Production API endpoint */
  export const ENDPOINT: string;
  /** Development/test API endpoint */
  export const ENDPOINT_DEV: string;
  export { CanadaPostError };
}

/**
 * Custom error class for Canada Post API errors
 */
export declare class CanadaPostError extends Error {
  /**
   * Creates a new Canada Post error
   * @param message - Error message or error object(s)
   * @param code - Error code
   */
  constructor(message: string | { description: string; code: string } | Array<{ description: string; code: string }>, code: string);
  /** Error code */
  code: string;
  /** Original error messages from the API */
  originalMessages: Array<{ description: string; code: string }> | [];
}

declare module "canadapost-api";
