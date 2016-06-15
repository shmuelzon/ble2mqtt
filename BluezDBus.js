var events = require('events')
var debug = require('debug')('BluezDBus');
var DBus = require('dbus');
var dbus = new DBus();
var bus = dbus.getBus('system');

var bluezDBus = new events.EventEmitter();

var objectManagerInterface = null;

bluezDBus.getInterface = function(path, iface, cb) {
  bus.getInterface('org.bluez', path, iface, cb);
}

function _notifyPropertyChange(func, properties) {
  if (!func)
    return;

  Object.keys(properties).forEach(function(key) {
    func(key, properties[key]);
  });
}

bluezDBus.setMaxListeners(Infinity);
bluezDBus.getProperties = function(path, interfaceName, propertyChangedCb, resolvedCb) {
  var ctx = {
    close: function() {
      this.iface.removeListener('PropertiesChanged', this.cb);
    }
  }
  bluezDBus.getInterface(path, 'org.freedesktop.DBus.Properties',
    function(err, iface) {
      if (err) {
        debug('Failed getting properties for ' + path + ': ' + err);
        return;
      }

      /* Save interface an callback so we can unregister later */
      ctx.iface = iface;
      ctx.cb = function(_interfaceName, properties) {
        if (_interfaceName !== interfaceName)
          return;

        _notifyPropertyChange(propertyChangedCb, properties);
      };
      /* Listen on changes */
      iface.on('PropertiesChanged', ctx.cb);

      /* Get all properties */
      iface.GetAll['finish'] = function(properties) {
        _notifyPropertyChange(propertyChangedCb, properties);

        if (resolvedCb)
          resolvedCb();
      };
      iface.GetAll['error'] = resolvedCb;
      iface.GetAll(interfaceName);
    }
  );

  return ctx;
}

bluezDBus.getAllObjects = function(cb) {
  if (objectManagerInterface === null) {
    /* ObjectManager isn't available yet, try again later */
    setTimeout(function() { bluezDBus.getAllObjects(cb); }, 100);
    return;
  }

  /* Set callback functions */
  objectManagerInterface.GetManagedObjects['finish'] = function(objects) {
    cb(undefined, objects);
  };
  objectManagerInterface.GetManagedObjects['error'] = cb;

  /* Initiate call */
  objectManagerInterface.GetManagedObjects();
}

bluezDBus.onInterfaces = function(interfaceAddedCb, interfaceRemovedCb) {
  if (interfaceAddedCb) this.on('interfaceAdded', interfaceAddedCb);
  if (interfaceRemovedCb) this.on('interfaceRemoved', interfaceRemovedCb);

  return {
    _addedCb: interfaceAddedCb,
    _removedCb: interfaceRemovedCb,
    _bluezDBus: this,
    close: function() {
      if (this._addedCb)
        this._bluezDBus.removeListener('interfaceAdded', this._addedCb);
      if (this._removedCb)
      this._bluezDBus.removeListener('interfaceRemoved', this._removedCb);
    }
  };
}

/* Get ObjectManager and register events */
bluezDBus.getInterface('/', 'org.freedesktop.DBus.ObjectManager',
  function(err, iface) {
    if (err)
      throw 'Failed getting the ObjectManager interface: ' + err;

    /* Save interface */
    objectManagerInterface = iface;

    /* Listen on object changes and notify */
    objectManagerInterface.on('InterfacesAdded', function(path, objects) {
      bluezDBus.emit('interfaceAdded', path, objects);
    });
    objectManagerInterface.on('InterfacesRemoved', function(path, objects) {
      bluezDBus.emit('interfaceRemoved', path, objects);
    });
  }
);

module.exports = bluezDBus;
