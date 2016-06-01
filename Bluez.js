var events = require('events');
var debug = require('debug')('Bluez');
var bluezDBus = require('./BluezDBus');
var BluezAdapter = require('./BluezAdapter');

var bluez = new events.EventEmitter();

function interfaceAdded(path, objects) {
  /* We're only interested in Adapters */
  if (objects['org.bluez.Adapter1'] === undefined)
    return;

  debug('An adapter was added: ' + path);
  var adapter = new BluezAdapter(path);
  adapter.init(function(err) {
    if (err) {
      debug('Failed initializing new adapter ' + path + ': ' + err);
      return;
    }
    bluez.emit('adapter', adapter);
  });
}

function interfaceRemoved(path, objects) {
  /* We're only interested in adapters */
  if (objects['org.bluez.Adapter1'] === undefined)
    return;

  debug('An adapter was removed: ' + path);
}

bluezDBus.getAllObjects(function(err, objects) {
  if (err)
    throw 'Failed getting all objects';

  Object.keys(objects).forEach(function(key) {
    interfaceAdded(key, objects[key]);
  });
});

bluezDBus.on('interfaceAdded', interfaceAdded);
bluezDBus.on('interfaceRemoved', interfaceRemoved);

module.exports = bluez;
