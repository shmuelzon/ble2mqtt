const EventEmitter = require('events').EventEmitter;
const util = require('util');
const _ = require('underscore');
const bluezDBus = require('./BluezDBus');
const BluezDevice = require('./BluezDevice');

module.exports = BluezAdapter;

function BluezAdapter(path){
  this.debug = require('debug')('Bluez:Adapter:' + path);
  this.path = path;
  this.debug('New adapter');
}

util.inherits(BluezAdapter, EventEmitter);

BluezAdapter.prototype.init = function(cb) {
  /* Get Adapter1 interface */
  bluezDBus.getInterface(this.path, 'org.bluez.Adapter1', (err, iface) => {
    if (err) {
      this.debug('Failed getting Adapter1 interface:' + err);
      if (cb) cb(err);
      return;
    }

    /* Save this interface */
    this.iface = iface;

    /* Get Protperties interface */
    this.props = bluezDBus.getProperties(this.path, 'org.bluez.Adapter1',
      this._devicePropertiesUpdate.bind(this), /* Property changed */
      (err) => { /* All propertires were resolved */
        if (err) {
          this.debug('Failed getting all properties:' + err);
          if (cb) cb(err);
          return;
        }

        /* The new adapter is ready, wait 2 seconds until it settles down */
        if (cb) setTimeout(cb, 2000);
      });
  });

  /* Save the event handler so we can remove it later */
  this.ifaceEvents = bluezDBus.onInterfaces(this._interfaceAdded.bind(this),
    this._interfaceRemoved.bind(this));
}

BluezAdapter.prototype.toString = function() {
  return '[Object BluezAdapter (' + this.path + ')]';
}

BluezAdapter.prototype._isOwnDevice = function(path, objects) {
  /* If we're not powered, we don't care about cached devices yet */
  if (!this.Powered)
    return false;

  /* Make sure this device was discovered using this adapter */
  if (!path.startsWith(this.path))
    return false;

  /* We're only interested in devices */
  if (objects['org.bluez.Device1'] === undefined)
    return false;

  return true;
}

BluezAdapter.prototype._onPowerChanged = function(powered) {
  if (!powered)
    return;

  /* The adapter was powered on, now let's check if there are any relevant
   * objects (devices) */
  bluezDBus.getAllObjects((err, objects) => {
    if (err)
      throw 'Failed getting all objects';

    Object.keys(objects).forEach((key) => {
      this._interfaceAdded(key, objects[key]);
    });
  });
}

BluezAdapter.prototype._devicePropertiesUpdate = function(key, value) {
  if (_.isEqual(this[key], value))
    return;

  this.debug(key + ' changed from ' + this[key] + ' to ' + value);
  this[key] = value;

  if (key == 'Powered')
    this._onPowerChanged(value);

  this.emit('propertyChanged', key, value);
}

BluezAdapter.prototype._interfaceAdded = function(path, objects) {
  /* We're only interested in devices under this adapter  */
  if (!this._isOwnDevice(path, objects))
    return;

  this.debug('A device was added: ' + path);
  var device = new BluezDevice(path);
  device.init((err) => {
    if (err) {
      this.debug('Failed initializing new device ' + path + ': ' + err);
      return;
    }
    this.emit('device', device);
  });
}

BluezAdapter.prototype._interfaceRemoved = function(path, objects) {
  /* We're only interested in ourselves */
  if (this.path !== path)
    return;

  this.emit('removed');
  this.removeAllListeners();
  this.props.close();
  this.ifaceEvents.close();
}

BluezAdapter.prototype.powerOn = function(cb) {
  this.iface.setProperty('Powered', true, (err) => {
    if (err)
      this.debug('Failed powering on:' + err);
    else
      this.debug('Powered on');

    if (cb) cb(err);
  });
}

BluezAdapter.prototype.powerOff = function(cb) {
  this.iface.setProperty('Powered', false, (err) => {
    if (err)
      this.debug('Failed powering off:' + err);
    else
      this.debug('Powered off');

    if (cb) cb(err);
  });
}

BluezAdapter.prototype.discoveryStart = function(cb) {
  this.iface.StartDiscovery['finish'] = () => {
    this.debug('Started discovering');
    if (cb) cb();
  };
  this.iface.StartDiscovery['error'] = (err) => {
    this.debug('Failed starting discovery: ' + err);
    if (cb) cb(err);
  };
  this.iface.StartDiscovery();
}

BluezAdapter.prototype.discoveryStop = function(cb) {
  this.iface.StopDiscovery['finish'] = () => {
    this.debug('Stopped discovering');
    if (cb) cb();
  };
  this.iface.StopDiscovery['error'] = (err) => {
    this.debug('Failed stopping discovery: ' + err);
    if (cb) cb(err);
  };
  this.iface.StopDiscovery();
}

BluezAdapter.prototype.discoveryFilterSet = function(filter, cb) {
  this.iface.SetDiscoveryFilter['finish'] = () => {
    this.debug('Set discovery filter:', filter);
    if (cb) cb();
  };
  this.iface.SetDiscoveryFilter['error'] = (err) => {
    this.debug('Failed setting discovery filter: ' + err);
    if (cb) cb(err);
  };
  this.iface.SetDiscoveryFilter(filter);
}

BluezAdapter.prototype.removeDevice = function(device, cb) {
  this.iface.RemoveDevice['finish'] = () => {
    this.debug('Removed device');
    if (cb) cb();
  };
  this.iface.RemoveDevice['error'] = (err) => {
    this.debug('Failed removing device: ' + err);
    if (cb) cb(err);
  };
  this.iface.RemoveDevice(device.path);
}
