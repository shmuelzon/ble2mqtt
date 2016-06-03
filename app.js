var debug = require('debug')('ble2mqtt');
var _ = require('underscore');
var _mqtt = require('mqtt');
var bluez = require('./Bluez');
var config = require('./config');

var adapters = [];
var characteristics = {};

var mqtt = _mqtt.connect(config.mqtt.server);

mqtt.on('connect', function(connack) {
  debug('Connected to MQTT server');
});

mqtt.on('message', function(topic, message) {
  var c = characteristics[topic];
  if (!c)
    return;

  var newVal = eval('[' + message + ']');

  /* Is this a different value? */
  if (_.isEqual(c.Value, newVal))
    return;

  /* Write the new value and read it back */
  debug('Writing ' + newVal + ' to ' + c.UUID);
  c.Write(newVal, function() { c.Read() });
});

bluez.on('adapter', function(adapter) {
  debug('Found new adapter: ' + adapter);
  adapters.push(adapter);

  adapter.on('device', function(device) {
    debug('Found new device: ' + device.Address + ' (' + device.Alias +')');

    device.on('service', function(service) {
      debug('Found new service: ' + service.UUID);

      service.on('characteristic', function(characteristic) {
        debug('Found new characteristic: ' + characteristic.UUID + ' (' +
          characteristic.Flags + ')');
        var get_topic = device.Address + '/' + service.UUID + '/' +
          characteristic.UUID;
        var set_topic = get_topic + '/set';

        /* Listen on notifications */
        if (characteristic.Flags.indexOf('notify') !== -1)
          characteristic.NotifyStart();

        /* Read initial value */
        if (characteristic.Flags.indexOf('read') !== -1)
          characteristic.Read(); /* We'll get the value in the Value property */

        characteristic.on('propertyChanged', function(key, value) {
          if (key === 'Value') {
            debug('Got new value for ' + characteristic.UUID + ': ' + value);
            mqtt.publish(get_topic, value.toString());
          }
        });

        /* If characteristic is writable, allow setting it via MQTT */
        if (characteristic.Flags.indexOf('write') !== -1) {
          characteristics[set_topic] = characteristic;
          mqtt.subscribe(set_topic);
        }
      });
    });

    device.Connect(function(err) {
      if (err) return;

      debug('Connected to ' + device);
    });
  });

  adapter.powerOn(function(err) {
    if (err) return;

    debug('Powered on ' + adapter);
    adapter.discoveryStart(function(err) {
      if (err) return;

      debug('Started discovery on ' + adapter);
    });
  });
});

function cleanupAndExit() {
  debug('Shutting down...');
  var tasks = 0;

  /* Disconnect from MQTT server */
  mqtt.end();

  /* Turn off all adapters (will also disconnect from devices) */
  var adaptersLength = adapters.length;
  tasks += adaptersLength;
  for (var i = 0; i < adaptersLength; i++) {
    adapters[i].powerOff(function() { tasks--; });
  }

  /* Wait for operations to end, then exit */
  setInterval(function() { if (tasks == 0) process.exit(0); }, 100);
}
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
