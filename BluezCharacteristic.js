const EventEmitter = require('events').EventEmitter;
const util = require('util');
const _ = require('underscore');
const bluezDBus = require('./BluezDBus');

module.exports = BluezCharacteristic;

function BluezCharacteristic(path) {
  this.debug = require('debug')('Bluez:Characteristic:' + path);
  this.path = path;
  this.debug('New characteristic');
}

util.inherits(BluezCharacteristic, EventEmitter);

BluezCharacteristic.prototype.init = function(cb) {
  /* Get GattCharacteristic1 interface */
  bluezDBus.getInterface(this.path, 'org.bluez.GattCharacteristic1',
    (err, iface) => {
      if (err) {
        this.debug('Failed getting GattCharacteristic1 interface:' + err);
        if (cb) cb(err);
        return;
      }

      /* Save this interface */
      this.iface = iface;

      /* Get Protperties interface */
      this.props = bluezDBus.getProperties(this.path,
        'org.bluez.GattCharacteristic1',
        this._characteristicPropertiesUpdate.bind(this), /* Property changed */
        (err) => { /* All propertires were resolved */
          if (err) {
            this.debug('Failed getting all properties:' + err);
            if (cb) cb(err);
            return;
          }

          /* The new characteristic is ready */
          if (cb) cb();
        });
    }
  );

  /* Save the event handler so we can remove it later */
  this.ifaceEvents = bluezDBus.onInterfaces(null,
    this._interfaceRemoved.bind(this));
}

BluezCharacteristic.prototype.toString = function() {
  return '[Object BluezCharacteristic (' + this.path + ')]';
}

BluezCharacteristic.prototype._characteristicPropertiesUpdate = function(key, value) {
  if (_.isEqual(this[key], value))
    return;

  this.debug(key + ' changed from ' + this[key] + ' to ' + value);
  this[key] = value;
  this.emit('propertyChanged', key, value);
}

BluezCharacteristic.prototype._interfaceRemoved = function(path, objects) {
  /* We're only interested in ourselves */
  if (this.path !== path)
    return;

  this.debug('Removed characteristic');
  this.emit('removed');
  this.removeAllListeners();
  this.props.close();
  this.ifaceEvents.close();
}

BluezCharacteristic.prototype.Read = function(cb) {
  this.iface.ReadValue['finish'] = (value) => {
    this.debug('Read: ' + value);
    if (cb) cb(null, value);
  };
  this.iface.ReadValue['error'] = (err) => {
    this.debug('Failed reading: ' + err);
    if (cb) cb(err);
  };
  this.iface.ReadValue({});
}

BluezCharacteristic.prototype.Write = function(value, cb) {
  this.iface.WriteValue['finish'] = () => {
    this.debug('Wrote value: ' + value);
    if (cb) cb();
  };
  this.iface.WriteValue['error'] = (err) => {
    this.debug('Failed writing: ' + err);
    if (cb) cb(err);
  };
  this.iface.WriteValue(value, {});
}

BluezCharacteristic.prototype.NotifyStart = function(cb) {
  this.iface.StartNotify['finish'] = () => {
    this.debug('Listening on notifications');
    if (cb) cb();
  };
  this.iface.StartNotify['error'] = (err) => {
    this.debug('Failed listening on notifications: ' + err);
    if (cb) cb(err);
  };
  this.iface.StartNotify();
}

BluezCharacteristic.prototype.NotifyStop = function(cb) {
  this.iface.StopNotify['finish'] = () => {
    this.debug('Stopped listening on notifications');
    if (cb) cb();
  };
  this.iface.StopNotify['error'] = (err) => {
    this.debug('Failed stopping listening on notifications: ' + err);
    if (cb) cb(err);
  };
  this.iface.StopNotify();
}
