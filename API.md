# API

This class loosely follows the API available from CanadaPost. See [their documentation](https://www.canadapost.ca/cpo/mc/business/productsservices/developers/services/default.jsf) for more information.

## Property Naming & Result Objects
The Canada API returns XML elements that are dash-separated.
These are converted to lowerCamelCase Javascript objects, and vice-versa when calling a method.

This means that instead of providing a property like `show-packing-instructions`, you may provide `showPackingInstructions`,
and it will be converted before being sent with the request.

Result objects are somewhat normalized, to reduce the amount of unncessary XML information/structure that is generated.

## Promises
_All_ Candada Post API methods return a [Bluebird promise](https://github.com/petkaantonov/bluebird).

## API
- [CanadaPostClient](#CanadaPostClient)
    - [`new CanadaPostClient(userId, password, [customer, [lang]])`](#new-canadapostclient-userid-password-customer-lang---canadapostclient)
    - [`.discoverServices(originPostalCode, destinationCountry, [destinationPostalCode])` -> `Promise`](#discoverservices-originpostalcode-destinationcountry-destinationpostalcode---promise)
    - *(additional documentation coming soon)*
    
## CanadaPostClient
The main class for working with the Canada Post API

##### `new CanadaPostClient(userId, password, [customer, [lang]])` -> `CanadaPostClient`
Creates a new instance of the CanadaPostClient class, that will authenticate requests with the provided username and password.

Arguments:

- `userId` (String) - Your [username](https://www.canadapost.ca/cpotools/apps/drc/registered?execution=e3s1)
- `password` (String) - Your [password](https://www.canadapost.ca/cpotools/apps/drc/registered?execution=e3s1)
- `customer` (String) [optional] - Your customer ID. This will be used by default for requests, if one is required in the path.
- `lang` (String) [optional] - The language of the responses. Should be one of en-CA, or fr-CA.

Example:
```javascript
const cpClient = new CanadaPostClient('b4c32...', 'c0009a...');

let result = cpClient.discoverServices('P0ST4L','US');
```

Returns: `CanadaPostClient instance`

***

##### `.discoverServices(originPostalCode, destinationCountry, [destinationPostalCode])` -> `Promise`
Discovers available services for creating a shipment between the origin postal code, and destination.

See: https://www.canadapost.ca/cpo/mc/business/productsservices/developers/services/rating/getrates/discoverservices.jsf

Arguments:

- `originPostalCode` (String) - The origin postal code, within Canada, that the item is being shipped from
- `destinationCountry` (String) - The ISO2 country code the package is being shipped to
- `destinationPostalCode` (String) [optional] - If the destination is within Canada, provide the destination postal code for more accurate results.

Returns: `Promise`
Resolves: `Array` - An array of services codes for shipping from the origin to the destination

***
