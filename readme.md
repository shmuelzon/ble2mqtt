# BLE2MQTT

This project aims to be a BLE to MQTT bridge, i.e. expose BLE GATT
characteristics as MQTT topics for bidirectional communication. It relies on the
BlueZ DBus API and as such is supported on Linux only.

For example, if a device with a MAC address of `A0:E6:F8:50:72:53` exposes the
[0000180f-0000-1000-8000-00805f9b34fb service](https://developer.bluetooth.org/gatt/services/Pages/ServiceViewer.aspx?u=org.bluetooth.service.battery_service.xml)
(Battery Service) which includes the
[00002a19-0000-1000-8000-00805f9b34fb characteristic](https://developer.bluetooth.org/gatt/characteristics/Pages/CharacteristicViewer.aspx?u=org.bluetooth.characteristic.battery_level.xml)
(Battery Level), the `A0:E6:F8:50:72:53/BatteryService/BatteryLevel`
MQTT topic is published with a value representing the battery level.

In order to set a GATT value, publish a message to a writable characteristic
using the above format suffixed with `/Set`. Note that values are byte arrays so
writing a 64-bit value would look like `10,231,32,24`.

## To Do

* Add configuration file:
  * ~~MQTT settings~~
  * ~~Single/Split topic for get/set~~
  * MQTT topic prefix (to distinguish between different instances of the app)
* Error handling:
  * What happens when an adapter/device is disconnected? Do we need to cleanup
    anything? What happens to events on removed devices?
* Pretty names (should be configurable):
  * ~~Allow using different properties as device name~~
    * Listen on changes in the property used for the device name as if it
      changes, topic names (both published and subscribed) need to be updated
  * ~~Use service/characteristic name instead of UUID~~
    * ~~Extendable via configuration file~~
* Pretty values (convert byte array to Boolean, String, etc.):
  * Configuration file can define custom characteristics
* Refactoring
  * Create a separate NPM module out of the BlueZ code
  * Lots of similar code copy-pasted, we can do better
* Security
  * Support pairing via AgentManager1 API

## License

The MIT License (MIT)

Copyright (c) 2016 Assaf Inbal

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
