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

## Configuration

While the basic configuration file provided in the repository
([config.json](https://github.com/shmuelzon/ble2mqtt/blob/master/config.json))
should be enough for most users, it is possible to tweak it a bit to fit one's
specific needs.

The `mqtt` section below includes the following entries:
```json
{
  "mqtt": {
    "server": {
      "host": "127.0.0.1",
      "port": 1883
    },
    "publish": {
      "retain": true
    },
    "topics" :{
      "device_name": "Address",
      "set_suffix": "/Set"
    }
  }
}
```
* `server` - define which MQTT broker the application should connect to
* `publish` - configuration for publishing topics. This object is passed as-is
  to the [mqtt.publish()](https://github.com/mqttjs/MQTT.js#publish) method
* `topics`
  * `device name` - define which attribute of a device (as exposed by Bluez)
    should be used to identify it in the MQTT topic
  * `set_suffix` - Which suffix should be added to the MQTT value topic in order
    to write a new value to the characteristic. Set this to an empty string if
    you wish to use the same topic for reading and writing

The `ble` section of the configuration file includes the following default
configuration:
```json
{
  "ble": {
    "services": { },
    "characteristics": { }
  }
}
```
* `services` - add an additional service or override an existing definition to
  the ones grabbed automatically on first run from http://www.bluetooth.org.
  Each service can include a `name` field which will be used in the MQTT topic
  instead of its UUID. For example:

    ```json
    "services": {
      "00002f00-0000-1000-8000-00805f9b34fb": {
        "name": "Relay Service"
      },
    }
    ```
* `characteristics` - add an additional characteristic or override an existing
  definition to the ones grabbed automatically on first run from
  http://www.bluetooth.org. Each characteristic can include a `name` field which
  will be used in the MQTT topic instead of its UUID, a `types` array defining
  how to parse the byte array reflecting the characteristic's value and a `poll`
  value (in seconds) for the application to poll the BLE device for a new value.
  For example:

    ```json
    "characteristics": {
      "00002a19-0000-1000-8000-00805f9b34fb": {
        "//": "Poll the battery level characteristic every day",
        "poll": 86400
      },
      "00002f01-0000-1000-8000-00805f9b34fb": {
        "name": "Relay State",
        "types": [
          "boolean"
        ]
      }
    }
    ```
* `whitelist`/`blacklist` - An array of strings or regular expressions used to
  match MAC addresses of devices. If `whitelist` is used, only devices with a
  MAC address matching one of the entries will be connected while if `blacklist`
  is used, only devices that do not match any entry will be connected to.

    ```json
    "whitelist": [
      "A0:E6:F8:.*"
    ]
    ```

* `passkeys` - An object containing the passkey (number 000000~999999) used for
  out-of-band authorization. Each entry is the MAC address of the BLE device and
  the value is the passkey to use.

    ```json
    "passkeys": {
      "B0:B4:48:D3:63:98": 123456
    }
    ```

## Installation

This app requires node version >= 4.3.2 (need support for arrow functions) as
well as a fairly recent version of Bluez (>= 5.40).

> Note that you can probably point your apt sources to stretch/testing to get
> newer versions of these packages. I, personally, haven't tried that yet

### Bluez

My personal setup is a Raspberry Pi 3 utilizing its built-in Bluetooth radio. I
needed to build a newer version of Bluez and needed it to be a Debian package
since a different package (pi-bluetooth, which creates the HCI device) depends
on it. To overcome this, I ran the following:

```bash
# Get dependencies
sudo apt-get update
sudo apt-get install -y libusb-dev libdbus-1-dev libglib2.0-dev libudev-dev \
  libical-dev libreadline-dev checkinstall 

# Compile + Install Bluez 5.40
mkdir -p ~/Downloads
wget -O ~/Downloads/bluez-5.40.tar.xz http://www.kernel.org/pub/linux/bluetooth/bluez-5.40.tar.xz
mkdir -p ~/code
cd ~/code
tar -xvf ~/Downloads/bluez-5.40.tar.xz
cd bluez-5.40

# Allow tabs to be tabs (for patches)
bind '\C-i:self-insert'
 
patch -p1 << EOF
--- a/tools/hciattach.c
+++ b/tools/hciattach.c
@@ -1236,7 +1236,7 @@
 {
 	struct uart_t *u = NULL;
 	int detach, printpid, raw, opt, i, n, ld, err;
-	int to = 10;
+	int to = 30;
 	int init_speed = 0;
 	int send_break = 0;
 	pid_t pid;
--- a/tools/hciattach_bcm43xx.c
+++ b/tools/hciattach_bcm43xx.c
@@ -43,7 +43,7 @@
 #include "hciattach.h"
 
 #ifndef FIRMWARE_DIR
-#define FIRMWARE_DIR "/etc/firmware"
+#define FIRMWARE_DIR "/lib/firmware"
 #endif
 
 #define FW_EXT ".hcd"
@@ -366,11 +366,8 @@
 		return -1;
 
 	if (bcm43xx_locate_patch(FIRMWARE_DIR, chip_name, fw_path)) {
-		fprintf(stderr, "Patch not found, continue anyway\n");
+		fprintf(stderr, "Patch not found for %s, continue anyway\n", chip_name);
 	} else {
-		if (bcm43xx_set_speed(fd, ti, speed))
-			return -1;
-
 		if (bcm43xx_load_firmware(fd, fw_path))
 			return -1;
 
@@ -380,6 +377,7 @@
 			return -1;
 		}
 
+		sleep(1);
 		if (bcm43xx_reset(fd))
 			return -1;
 	}
--- a/src/bluetooth.conf
+++ b/src/bluetooth.conf
@@ -34,6 +34,10 @@
     <allow send_destination="org.bluez"/>
   </policy>
 
+  <policy group="bluetooth">
+    <allow send_destination="org.bluez"/>
+  </policy>
+
   <policy context="default">
     <deny send_destination="org.bluez"/>
   </policy>
--- a/src/bluetooth.service.in
+++ b/src/bluetooth.service.in
@@ -6,7 +6,7 @@
 [Service]
 Type=dbus
 BusName=org.bluez
-ExecStart=@libexecdir@/bluetoothd
+ExecStart=@libexecdir@/bluetoothd -E
 NotifyAccess=main
 #WatchdogSec=10
 #Restart=on-failure
EOF

# Re-enable tabs
bind '\C-i:complete'

./configure --disable-cups --disable-obex --prefix=/usr --libexecdir=/usr/lib --localstatedir=/var/lib/bluetooth/
make -j 4
sudo checkinstall -y --nodoc --maintainer=shmuelzon@gmail.com
```

### Node
To install Node, I used the following:
```bash
# Install Node
curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Startup on boot

Raspbian Jesse uses systemd as its init process, so I created a service file for
it. Make sure to add your used to the `bluetooth` group so you can run this
application without running as root.

```bash
cat << EOF > ble2mqtt@$USER.service
[Unit]
Description=BLE2MQTT Bridge for %i
After=network.target bluetooth.service

[Service]
Type=simple
WorkingDirectory=/home/%i/code/ble2mqtt
ExecStart=/usr/bin/npm start
User=%i
SendSIGKILL=no
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo mv ble2mqtt@$USER.service /lib/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ble2mqtt@$USER.service
sudo systemctl start ble2mqtt@$USER.service
```

## To Do

* Add configuration file:
  * ~~MQTT settings~~
  * ~~Single/Split topic for get/set~~
  * MQTT topic prefix (to distinguish between different instances of the app)
* ~~Error handling:~~
  * ~~What happens when an adapter/device is disconnected? Do we need to cleanup
    anything? What happens to events on removed devices?~~
* Pretty names (should be configurable):
  * ~~Allow using different properties as device name~~
    * Listen on changes in the property used for the device name as if it
      changes, topic names (both published and subscribed) need to be updated
  * ~~Use service/characteristic name instead of UUID~~
    * ~~Extendable via configuration file~~
* ~~Pretty values (convert byte array to Boolean, String, etc.):~~
  * ~~Configuration file can define custom characteristics~~
* Refactoring
  * Create a separate NPM module out of the BlueZ code
  * Lots of similar code copy-pasted, we can do better
* ~~Security~~
  * ~~Support pairing via AgentManager1 API~~

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
