var EventEmitter = require('events').EventEmitter;
var util = require('util');
var bluezDBus = require('./BluezDBus');
var BluezDevice = require('./BluezDevice');

module.exports = BluezAdapter;

function BluezAdapter(path){
  this.debug = require('debug')('Bluez:Adapter:' + path);
  this.path = path;
  this.debug('New adapter');
}

util.inherits(BluezAdapter, EventEmitter);

BluezAdapter.prototype.init = function(cb) {
  /* Get Adapter1 interface */
  bluezDBus.getInterface(this.path, 'org.bluez.Adapter1',
    function(err, iface) {
      if (err) {
        this.debug('Failed getting Adapter1 interface:' + err);
        if (cb) cb(err);
        return;
      }

      /* Save this interface */
      this.iface = iface;

      /* Get Protperties interface */
      bluezDBus.getProperties(this.path, 'org.bluez.Adapter1',
        this._devicePropertiesUpdate.bind(this), /* Property changed */
        function(err) { /* All propertires were resolved */
          if (err) {
            this.debug('Failed getting all properties:' + err);
            if (cb) cb(err);
            return;
          }

          /* The new adapter is ready */
          if (cb) cb();
        }.bind(this));
    }.bind(this)
  );

  bluezDBus.on('interfaceAdded', this._interfaceAdded.bind(this));
  bluezDBus.on('interfaceRemoved', this._interfaceRemoved.bind(this));
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
  bluezDBus.getAllObjects(function(err, objects) {
    if (err)
      throw 'Failed getting all objects';

    Object.keys(objects).forEach(function(key) {
      this._interfaceAdded(key, objects[key]);
    }.bind(this));
  }.bind(this));
}

BluezAdapter.prototype._devicePropertiesUpdate = function(key, value) {
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
  device.init(function(err) {
    if (err) {
      this.debug('Failed initializing new device ' + path + ': ' + err);
      return;
    }
    this.emit('device', device);
  }.bind(this));
}

BluezAdapter.prototype._interfaceRemoved = function(path, objects) {
  /* We're only interested in devices under this adapter  */
  if (!this._isOwnDevice(path, objects))
    return;

  this.debug('A device was removed: ' + path);
}

BluezAdapter.prototype.powerOn = function(cb) {
  this.iface.setProperty('Powered', true, function(err) {
    if (err)
      this.debug('Failed powering on:' + err);
    else
      this.debug('Powered on');

    if (cb) cb(err);
  }.bind(this));
}

BluezAdapter.prototype.powerOff = function(cb) {
  this.iface.setProperty('Powered', false, function(err) {
    if (err)
      this.debug('Failed powering off:' + err);
    else
      this.debug('Powered off');

    if (cb) cb(err);
  }.bind(this));
}

BluezAdapter.prototype.discoveryStart = function(cb) {
  this.iface.StartDiscovery['finish'] = function() {
    this.debug('Started discovering');
    if (cb) cb();
  }.bind(this);
  this.iface.StartDiscovery['error'] = function(err) {
    this.debug('Failed starting discovery: ' + err);
    if (cb) cb(err);
  }.bind(this);
  this.iface.StartDiscovery();
}

BluezAdapter.prototype.discoveryStop = function(cb) {
  this.iface.StopDiscovery['finish'] = function() {
    this.debug('Stopped discovering');
    if (cb) cb();
  }.bind(this);
  this.iface.StopDiscovery['error'] = function(err) {
    this.debug('Failed stopping discovery: ' + err);
    if (cb) cb(err);
  }.bind(this);
  this.iface.StopDiscovery();
}
