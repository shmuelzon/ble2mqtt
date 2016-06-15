const EventEmitter = require('events').EventEmitter;
const util = require('util');
const bluezDBus = require('./BluezDBus');
const BluezService = require('./BluezService');

module.exports = BluezDevice;

function BluezDevice(path) {
  this.debug = require('debug')('Bluez:Device:' + path);
  this.path = path;
  this.debug('New device');
}

util.inherits(BluezDevice, EventEmitter);

BluezDevice.prototype.init = function(cb) {
  /* Get Device1 interface */
  bluezDBus.getInterface(this.path, 'org.bluez.Device1', (err, iface) => {
    if (err) {
      this.debug('Failed getting Device1 interface:' + err);
      if (cb) cb(err);
      return;
    }

    /* Save this interface */
    this.iface = iface;

    /* Get Protperties interface */
    this.props = bluezDBus.getProperties(this.path, 'org.bluez.Device1',
      this._devicePropertiesUpdate.bind(this), /* Property changed */
      (err) => { /* All propertires were resolved */
        if (err) {
          this.debug('Failed getting all properties:' + err);
          if (cb) cb(err);
          return;
        }

        /* The new device is ready */
        if (cb) cb();
      });
  });

  /* Save the event handler so we can remove it later */
  this.ifaceEvents = bluezDBus.onInterfaces(this._interfaceAdded.bind(this),
    this._interfaceRemoved.bind(this));
}

BluezDevice.prototype.toString = function() {
  return '[Object BluezDevice (' + this.path + ')]';
}

BluezDevice.prototype._isOwnService = function(path, objects) {
  /* If the services were not resolved yet, we don't care about cached ones */
  if (!this.ServicesResolved)
    return false;

  /* Make sure this services was discovered on this device */
  if (!path.startsWith(this.path))
    return false;

  /* We're only interested in services */
  if (objects['org.bluez.GattService1'] === undefined)
    return false;

  return true;
}

BluezDevice.prototype._onServicesResolvedChanged = function(servicesResolved) {
  if (!servicesResolved)
    return;

  /* The device is resolved, now let's check if there are any relevant objects
   * (services) */
  bluezDBus.getAllObjects((err, objects) => {
    if (err)
      throw 'Failed getting all objects';

    Object.keys(objects).forEach((key) => {
      this._interfaceAdded(key, objects[key]);
    });
  });
}

BluezDevice.prototype._devicePropertiesUpdate = function(key, value) {
  this.debug(key + ' changed from ' + this[key] + ' to ' + value);
  this[key] = value;

  if (key == 'ServicesResolved')
    this._onServicesResolvedChanged(value);

  this.emit('propertyChanged', key, value);
}

BluezDevice.prototype._interfaceAdded = function(path, objects) {
  /* We're only interested in services under this device  */
  if (!this._isOwnService(path, objects))
    return;

  this.debug('A service was added: ' + path);
  var service = new BluezService(path);
  service.init((err) => {
    if (err) {
      this.debug('Failed initializing new service ' + path + ': ' + err);
      return;
    }
    this.emit('service', service);
  });
}

BluezDevice.prototype._interfaceRemoved = function(path, objects) {
  /* We're only interested in ourselves */
  if (this.path !== path)
    return;

  this.debug('Removed device');
  this.emit('removed');
  this.removeAllListeners();
  this.props.close();
  this.ifaceEvents.close();
}

BluezDevice.prototype.Connect = function(cb) {
  this.iface.Connect['finish'] = () => {
    this.debug('Connected');
    if (cb) cb();
  };
  this.iface.Connect['error'] = (err) => {
    this.debug('Failed connecting: ' + err);
    if (cb) cb(err);
  };
  this.iface.Connect();
}

BluezDevice.prototype.Disconnect = function(cb) {
  this.iface.Disconnect['finish'] = () => {
    this.debug('Disconnected');
    if (cb) cb();
  };
  this.iface.Disconnect['error'] = (err) => {
    this.debug('Failed disconnecting: ' + err);
    if (cb) cb(err);
  };
  this.iface.Disconnect();
}
