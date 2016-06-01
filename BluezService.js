var EventEmitter = require('events').EventEmitter;
var util = require('util');
var bluezDBus = require('./BluezDBus');
var BluezCharacteristic = require('./BluezCharacteristic');

module.exports = BluezService;

function BluezService(path) {
  this.debug = require('debug')('Bluez:Service:' + path);
  this.path = path;
  this.debug('New service');
}

util.inherits(BluezService, EventEmitter);

BluezService.prototype.init = function(cb) {
  /* Get GattService1 interface */
  bluezDBus.getInterface(this.path, 'org.bluez.GattService1',
    function(err, iface) {
      if (err) {
        this.debug('Failed getting GattService1 interface:' + err);
        if (cb) cb(err);
        return;
      }

      /* Save this interface */
      this.iface = iface;

      /* Get Protperties interface */
      bluezDBus.getProperties(this.path, 'org.bluez.GattService1',
        this._servicePropertiesUpdate.bind(this), /* Property changed */
        function(err) { /* All propertires were resolved */
          if (err) {
            this.debug('Failed getting all properties:' + err);
            if (cb) cb(err);
            return;
          }

          /* At this point, the device is connected and the services are already
           * resolved, just look for the relevant characteristics */
          bluezDBus.getAllObjects(function(err, objects) {
            if (err)
              throw 'Failed getting all objects';

            Object.keys(objects).forEach(function(key) {
              this._interfaceAdded(key, objects[key]);
            }.bind(this));

            /* The new service is ready */
            if (cb) cb();
          }.bind(this));
        }.bind(this));
    }.bind(this)
  );

  bluezDBus.on('interfaceAdded', this._interfaceAdded.bind(this));
  bluezDBus.on('interfaceRemoved', this._interfaceRemoved.bind(this));
}

BluezService.prototype.toString = function() {
  return '[Object BluezService (' + this.path + ')]';
}

BluezService.prototype._isOwnCharacteristic = function(path, objects) {
  /* Make sure this characteristic was discovered on this service */
  if (!path.startsWith(this.path))
    return false;

  /* We're only interested in services */
  if (objects['org.bluez.GattCharacteristic1'] === undefined)
    return false;

  return true;
}

BluezService.prototype._servicePropertiesUpdate = function(key, value) {
  this.debug(key + ' changed from ' + this[key] + ' to ' + value);
  this[key] = value;
  this.emit('propertyChanged', key, value);
}

BluezService.prototype._interfaceAdded = function(path, objects) {
  /* We're only interested in characteristics under this service  */
  if (!this._isOwnCharacteristic(path, objects))
    return;

  this.debug('A characteristic was added: ' + path);
  var characteristic = new BluezCharacteristic(path);
  characteristic.init(function(err) {
    if (err) {
      this.debug('Failed initializing new characteristic ' + path + ': ' + err);
      return;
    }
    this.emit('characteristic', characteristic);
  }.bind(this));
}

BluezService.prototype._interfaceRemoved = function(path, objects) {
  /* We're only interested in characteristics under this service  */
  if (!this._isOwnCharacteristic(path, objects))
    return;

  this.debug('A characteristic was removed: ' + path);
}
