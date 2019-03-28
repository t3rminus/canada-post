'use strict';
/* jshint -W030 */
require('dotenv').config();
const chaiExpect = require('chai').expect;
const CanadaPostClient = require('../lib/canadapost');

const cpc = new CanadaPostClient(process.env.CPC_USERNAME, process.env.CPC_PASSWORD, process.env.CPC_CUSTOMER);

describe('Canada Post', function () {
	this.timeout(20000);

	it('Discovers Domestic Services', () => {
		return cpc.discoverServices('V6G 3E2', 'CA', 'M5V 3L9')
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;
				const aResult = result[0];
				chaiExpect(aResult).to.contain.keys('serviceName', 'serviceCode');
				chaiExpect(result.every(r => /^DOM\./.test(r.serviceCode))).to.be.true;
			});
	});

	it('Discovers International Services (USA)', () => {
		return cpc.discoverServices('V6G 3E2', 'US')
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;
				const aResult = result[0];
				chaiExpect(aResult).to.contain.keys('serviceName', 'serviceCode');
				chaiExpect(result.every(r => /^USA\./.test(r.serviceCode))).to.be.true;
			});
	});

	it('Discovers International Services (Australia) with Postal Code', function () {
		return cpc.discoverServices('V6G 3E2', 'AU', '3000')
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;
				const aResult = result[0];
				chaiExpect(aResult).to.contain.keys('serviceName', 'serviceCode');
				chaiExpect(result.every(r => /^INT\./.test(r.serviceCode))).to.be.true;
			});
	});

	it('Gets Rates', () => {
		const rateQuery = {
			parcelCharacteristics: {
				weight: 1
			},
			originPostalCode: 'V5C2H2',
			destination: {
				domestic: {
					postalCode: 'V0N1B6'
				}
			}
		};

		return cpc.getRates(rateQuery)
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;
				const aResult = result[0];
				chaiExpect(aResult).to.contain.keys('priceDetails', 'serviceCode', 'serviceName', 'serviceStandard', 'weightDetails');
			});
	});

	it('Handles invalid postal codes', () => {
		const rateQuery = {
			parcelCharacteristics: {
				weight: 1
			},
			originPostalCode: 'Z9Z9Z9',
			destination: {
				domestic: {
					postalCode: 'POOT'
				}
			}
		};

		return cpc.getRates(rateQuery)
			.then(() => {
				expect.fail('Expected an invalid postal code to throw an error');
			})
			.catch(err => {
				chaiExpect(err).to.exist;
				chaiExpect(err).to.be.an.instanceof(CanadaPostClient.CanadaPostError);
			})
	});

	it('Can create a non-contract shipment', () => {
		const shipment = {
			requestedShippingPoint: 'V5C2H2',
			deliverySpec: {
				serviceCode: 'DOM.EP',
				sender: {
					company: 'Test Sender',
					contactPhone: '555-555-1234',
					addressDetails: {
						addressLine1: '4809 Albert St.',
						city: 'Burnaby',
						provState: 'BC',
						postalZipCode: 'V5C2H2'
					}
				},
				destination: {
					name: 'Test Recipient',
					addressDetails: {
						addressLine1: '9112 Emerald Dr.',
						city: 'Whistler',
						provState: 'BC',
						postalZipCode: 'V0N1B9',
						countryCode: 'CA'
					}
				},
				parcelCharacteristics: {
					weight: 1,
					document: false,
					dimensions: {
						length: 23,
						width: 18,
						height: 10
					}
				},
				preferences: {
					showPackingInstructions: true,
					showPostageRate: false,
					showInsuredValue: false
				},
				references: {
					customerRef1: 'test'
				}
			}
		};

		return cpc.createNonContractShipment(shipment)
			.then(result => {
				chaiExpect(result).to.be.an('object');
				chaiExpect(result).to.contain.keys('links', 'shipmentId', 'trackingPin');
				chaiExpect(result.links).to.contain.keys('label', 'self', 'details');
			});
	});

	it('Can get a tracking summary', () => {
		return cpc.getTrackingSummary('1681334332936901')
			.then(result => {
				chaiExpect(result).to.be.an('object');
				chaiExpect(result).to.contain.keys('actualDeliveryDate', 'attemptedDate', 'customerRef1', 'customerRef2',
					'deliveryOptionCompletedInd', 'destinationPostalId', 'destinationProvince', 'eventDateTime',
					'eventDescription', 'eventLocation', 'eventType', 'expectedDeliveryDate', 'mailedOnDate',
					'originPostalId', 'pin', 'returnPin', 'serviceName', 'signatoryName');
			});
	});

	it('Can get tracking detail', () => {
		return cpc.getTrackingDetail('1371134583769923')
			.then(result => {
				chaiExpect(result).to.be.an('object');
				chaiExpect(result).to.contain.keys('activeExists', 'archiveExists', 'changedExpectedDate',
					'changedExpectedDeliveryReason', 'customerRef1', 'customerRef2', 'deliveryOptions',
					'destinationPostalId', 'expectedDeliveryDate', 'mailedByCustomerNumber',
					'mailedOnBehalfOfCustomerNumber', 'originalPin', 'pin', 'returnPin', 'serviceName', 'serviceName2',
					'signatureImageExists', 'significantEvents', 'suppressSignature');

				chaiExpect(result.significantEvents).to.be.an('array');
				chaiExpect(result.significantEvents[0]).to.be.an('object');
				chaiExpect(result.significantEvents[0]).to.contain.keys('eventDate', 'eventDescription',
					'eventIdentifier', 'eventProvince', 'eventRetailLocationId', 'eventRetailName',
					'eventSite', 'eventTime', 'eventTimeZone', 'signatoryName');
			});
	});

	it('Can list shipments', () => {
		const timestamp = Date.now();
		return cpc.getShipments(timestamp - 115200000)
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;
				chaiExpect(result[0]).to.contain.keys('shipmentId', 'href', 'mediaType', 'rel');
			});
	});

	it('Can get shipment links', () => {
		const timestamp = Date.now();
		return cpc.getShipments(timestamp - 115200000)
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;

				return cpc.getShipment(result[0].shipmentId)
					.then((result) => {
						chaiExpect(result).to.be.an('object');
						chaiExpect(result).to.contain.keys('links', 'shipmentId', 'trackingPin');
						chaiExpect(result.links).to.contain.keys('label', 'self', 'details');
					});
			});
	});

	it('Can get shipment details', () => {
		const timestamp = Date.now();
		return cpc.getShipments(timestamp - 115200000)
			.then(result => {
				chaiExpect(result).to.be.an('array');
				chaiExpect(result).to.not.be.empty;

				return cpc.getShipmentDetails(result[0].shipmentId)
					.then((result) => {
						chaiExpect(result).to.be.an('object');
						chaiExpect(result.nonContractShipmentDetails).to.contain.keys('deliverySpec', 'finalShippingPoint', 'trackingPin');
						chaiExpect(result.nonContractShipmentDetails.deliverySpec).to.contain.keys('destination', 'serviceCode', 'sender', 'parcelCharacteristics');
					});
			});
	});
});
