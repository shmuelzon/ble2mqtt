const EventEmitter = require('events').EventEmitter;
const util = require('util');
const DBus = require('dbus');
const dbus = new DBus();
const bluezDBus = require('./BluezDBus');

module.exports = BluezAgent;

function BluezAgent(serviceName, path, onRegistered) {
  this.debug = require('debug')('Bluez:Agent:' + path);
  this.path = path;
  this.debug('New agent');

  /* Create service based on org.bluez.Agent1 definition. We only support BLE
   * devices at the moment and can only provide a passkey */
  var service = dbus.registerService('system', serviceName);
  var obj = service.createObject(path);
  var iface = obj.createInterface('org.bluez.Agent1');

  iface.addMethod('Release', {}, function(callback) {
    this.debug('Release()');
    callback();
  });

  iface.addMethod('RequestPasskey', { in: [{ type: 'o' }], out: { type: 'u' } },
    (device, callback) => {
      this.debug('RequestPasskey(' + device + ')');
      var passkey = null;
      if (this.passkeyHandler !== undefined)
        passkey = this.passkeyHandler(device);

      this.debug('Providing passkey ' + passkey + ' for ' + device);
      callback(passkey ? passkey : new Error('org.bluez.Error.Canceled'));
    }
  );

  iface.addMethod('Cancel', {}, function(callback) {
    debug('Cancel()');
    callback();
  });

  iface.update();
}

util.inherits(BluezAgent, EventEmitter);

BluezAgent.prototype.register = function(cb) {
  /* Register agent with Bluez */
  bluezDBus.getInterface('/org/bluez', 'org.bluez.AgentManager1', (err, iface) =>
  {
    if (err) {
      this.debug('Failed getting AgentManager1 interface:' + err);
      return;
    }

    /* Save this interface */
    this.iface = iface;

    iface.RegisterAgent['finish'] = () => {
      this.debug('Registered agent');
      if (cb) cb();
    };
    iface.RegisterAgent['error'] = (err) => {
      this.debug('Failed registered agent: ' + err);
      if (cb) cb(err);
    };
    iface.RegisterAgent(this.path, 'KeyboardOnly');
  });
}

BluezAgent.prototype.setDefault = function(cb) {
  if (!this.iface) {
    if (cb) cb('Agent was not registered yet');
    return;
  }

  this.iface.RequestDefaultAgent['finish'] = () => {
    this.debug('Set agent as default');
    if (cb) cb();
  };
  this.iface.RequestDefaultAgent['error'] = (err) => {
    this.debug('Failed settings as default agent: ' + err);
    if (cb) cb(err);
  };
  this.iface.RequestDefaultAgent(this.path);
}

BluezAgent.prototype.setPasskeyHandler = function(func) {
  this.passkeyHandler = func;
}
