var _aproto = Array.prototype;

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (suffix, maxpos) {
        maxpos = maxpos || this.length;
        maxpos = maxpos - suffix.length;
        return this.lastIndexOf(suffix, maxpos) === maxpos;
    };
}

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (prefix, position) {
        position = position || 0;
        return this.indexOf(prefix, position) === position;
    };
}

if (!String.prototype.contains) {
    String.prototype.contains = function (checkfor, position) {
        position = position || 0;
        return this.indexOf(checkfor, position) !== -1;
    };
}

if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (original, replacement) {
        var result = this.slice(0);
        while (result.indexOf(original) > -1)
            result = result.replace(original, replacement);
        return result;
    };
}

var _ext_global = function (/* string global var */ name, /* object */ definitions) {
    var obj = window[name];
    if (!obj) { // The container for these definitions wasn't defined yet
        obj = {};
        window[name] = obj;
    }
    for (var key in definitions) {
        if (key.indexOf('_') === 0)
            continue;
        if (obj.hasOwnProperty(key)) {
            // Preserve existing, prefixed with an underscore
            obj['_' + key] = obj[key];
        }
        obj[key] = definitions[key];
    }
};


_ext_global('_', {
    is: function (value) {
        return typeof value !== "undefined";
    },
    has: function (obj, key) {
        return obj.hasOwnProperty(key) && this.is(obj[key]) && obj[key] !== null;
    }
});

_ext_global('_', {

    log: function (msg) {
        if (_.is(console.log))
            console.log(msg);
    },

    isNode: function (value) {
        return value && value instanceof Node;
    },

    isObject: function (value) {
        return typeof value === "object" && !(value instanceof Array) && !(value instanceof Node);
    },

    isArray: function (value) {
        return typeof value === "object" && value instanceof Array;
    },

    isNumber: function (value) {
        return typeof value === "number";
    },

    isTruthy: function (value) {
        if (!_.is(value) || value == null)
            return false;
        var type = typeof value;
        switch (type) {
            case 'boolean':
                return value;
            case 'string':
                return value.length > 0;
            case 'number':
                return value > 0;
            case 'object':
                if (this.isArray(value))
                    return value.length > 0;
                for (var key in value)
                    if (value.hasOwnProperty(key) && this.isTruthy(value[key]))
                        return true;
                return false;
            default:
                return false;
        }
    },

    Selection: function (elements) {

        this._type_ = "selection";
        this.elements = elements;

        this.get = function () {
            var index = arguments[0];
            if (index === undefined)
                return this.elements;
            else
                return this.elements[index];
        };

        this.getClasses = function (element) {
            var parts = _.split(element.className, " ");
            var results = {};
            for (var i = 0; i < parts.length; i++)
                results[parts[i]] = true;
            return results;
        };

        this.setClasses = function (element, classes) {
            if (_.isArray(classes))
                element.className = classes.join(" ");
            else if (_.isObject(classes)) {
                var names = [];
                _.iterate(classes, function (name) {
                    names.push(name);
                });
                element.className = names.join(" ");
            }
            else
                throw "Error: Class names should be given in an array or an object.";

            return this;
        };

        this.addClass = function (classname) {
            for (var i = 0; i < this.elements.length; i++) {
                var element = this.elements[i];
                var classes = this.getClasses(element);
                classes[classname] = true;
                this.setClasses(element, classes);
            }
            return this;
        };

        this.removeClass = function (classname) {
            for (var i = 0; i < this.elements.length; i++) {
                var element = this.elements[i];
                var classes = this.getClasses(element);
                delete classes[classname];
                this.setClasses(element, classes);
            }
            return this;
        };

        this.show = function (dtype) {
            dtype = dtype || "block";
            for (var i = 0; i < this.elements.length; i++)
                this.elements[i].style.display = dtype;
            return this;
        };

        this.hide = function () {
            for (var i = 0; i < this.elements.length; i++)
                this.elements[i].style.display = "none";
            return this;
        };

        this.opacity = function (value) {
            var opa = parseFloat(value);
            if (isNaN(opa))
                throw "Invalid opacity value: '" + value + "'";
            for (var i = 0; i < this.elements.length; i++)
                this.elements[i].style.opacity = opa;
            return this;
        };

        this.bind = function (evtType, handler) {
            for (var i = 0; i < this.elements.length; i++)
                this.elements[i].addEventListener(evtType, handler, true);
            return this;
        };

        this.click = function (handler) {
            return this.bind('click', handler);
        };

        this.manipulate = function (handler) {
            for (var i = 0; i < this.elements.length; i++)
                handler(this.elements[i]);
            return this;
        }

    },

    byId: function (identifier) {
        if (!identifier)
            return null;
        return document.getElementById(identifier.startsWith("#") ? identifier.substring(1) : identifier);
    },

    select: function (selector) {
        // Check if it's a Node instead of an actual selector
        if (selector instanceof Node && selector.nodeName)
            return new _.Selection([selector]);
        if (_.isArray(selector))
            return new _.Selection(selector);
        var root = (this instanceof Node && this.nodeName) ? this : document;
        var results = root.querySelectorAll(selector);
        return new _.Selection(results);
    },

    sel: function (selector) {
        return this.select(selector);
    },

    ready: function (callback) {
        document.addEventListener("DOMContentLoaded", function (event) {
            callback(event);
        });
    },

    iterate: function (container, iterator, context) {

        context = context || container;
        var stop = false;

        if (this.isArray(container)) {

            var nativeSome = _aproto.some;

            if (nativeSome && container.forEach === nativeSome) {
                stop = container.some(iterator, context);
                if (stop)
                    return container;
            }
            else {
                for (var i = 0; i < container.length; i++) {
                    stop = iterator.call(context, container[i], i, container);
                    if (stop)
                        break;
                }
                return container
            }

        }
        else {

            if (!_.isObject(container) || container instanceof Node)
                throw "Error: The value to be iterated over should be either an array, or an object.";

            for (var key in container) {
                if (container.hasOwnProperty(key)) {
                    stop = iterator.call(context, key, container[key]);
                    if (stop)
                        break;
                }
            }

        }
        return container

    },

    numberize: function (input) {

        if (!this.is(input))
            throw "Error: No input given to numberize(input)";

        var result = null;
        if (input.indexOf('.') > -1)
            result = parseFloat(input);
        else
            result = parseInt(input);

        if (isNaN(result))
            throw "Error: Invalid number: '" + input + "'";

        return result;

    },

    contains: function (container, item) {
        if (!_.is(container) || container === null)
            return false;
        if (typeof container === "string")
            return container.indexOf(item) > -1;
        if (_.isArray(container)) {
            var indexOf = _aproto.indexOf;
            if (indexOf)
                return indexOf.call(container, item) > -1;
            for (var i = 0; i < container.length; i++) {
                if (container[i] === item)
                    return true;
            }
            return false;
        }
        // Check if item is a key in container, and whether the key's value is not undefined
        else if (_.isObject(container)) {
            return container.hasOwnProperty(item) && _.is(container[item]);
        }
        else
            throw "Error: .contains(..) can't handle a container of type: '" + typeof container + "'";
    },

    merge: function () { // Merge objects, works on inner objects too.

        var args = _.toArray(arguments);
        var first = _.first(args);
        var rest = _.rest(args);

        for (var i = 0; i < rest.length; i++) {
            _.iterate(rest[i], function (key, value) {
                var current = first[key];
                if (!_.isObject(value)) {
                    if (typeof current === "object")
                        throw "An object being merged contains an object value for the key ('" + key + "'), but it's a scalar value ('" + value + "') in another object to be merged. Can't combine those two.";
                    else
                        first[key] = value;
                }
                else {
                    if (typeof current === "undefined")
                        current = {}; // There was no current value for this key, so let's initialize an object to correspond to the incoming inner object, and to be merged with it.
                    else if (typeof current !== "object")
                        throw "An object being merged contains a scalar value ('" + current + "') for a key ('" + key + "') that's an inner object in another object to be merged. Can't combine those two.";
                    first[key] = _.merge(current, value); // Merge inner objects through recursion
                }
            });
        }

        return first;

    },

    flatten: function () {
        var results = [];
        for (var i = 0; i < arguments.length; i++) {
            var item = arguments[i];
            if (!_.isArray(item))
                results.push(item);
            else {
                for (var j = 0; j < item.length; j++) {
                    var value = item[j];
                    if (!_.isArray(value))
                        results.push(value);
                    else
                        results.concat(this.flatten(value));
                }
            }
        }
        return results;
    },

    split: function (strvar, delimiter) {
        var results = [];
        var parts = strvar.split(delimiter);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (part)
                results.push(part);
        }
        return results;
    },

    toArray: function (value) {

        if (!value)
            return [];

        // Check if the value is an 'arguments' -object.
        if (this.is(value.length) && value.callee)
            return _aproto.slice.call(value);

        if (this.isArray(value))
            return value.slice();

        throw "Error: Can't convert a " + typeof value + " into an array.";

    },

    map: function (sequence, iterator) {
        var results = [];
        for (var i = 0; i < sequence.length; i++)
            results.push(iterator.call(sequence[i]));
        return results;
    },

    first: function (sequence) {
        return sequence[0];
    },

    rest: function (sequence, startfrom /*1-upwards*/) {
        startfrom = startfrom || 1;
        return sequence.slice(startfrom);
    },

    last: function (sequence) {
        return sequence[sequence.length - 1];
    },

    unpack: function (sequence, numvalues) {
        var number = numvalues || sequence.length;
        var results = [];
        for (var i = 0; i < number; i++) {
            if ((i + 1) > sequence.length)
                results[i] = null;
            else
                results[i] = sequence[i];
        }
        return results;
    },

    clone: function (object) {
        var result = {};
        for (var name in object)
            if (object.hasOwnProperty(name))
                result[name] = object[name];
        return result;
    }

});
