
// Plates JS - Logic-ful templating for JavaScript

var __ext_global = function (name, definitions) {
    var obj = window[name];
    if (!obj) { // The container for these definitions wasn't defined yet
        obj = {};
        window[name] = obj;
    }
    for (var key in definitions) {
        if (obj.hasOwnProperty(key)) {
            // Preserve existing, prefixed with an underscore
            obj['_' + key] = obj[key];
        }
        obj[key] = definitions[key];
    }
};


__ext_global('_', { // We extend UnderscoreJS if it's present, but it's not actually a dependency.
    is:  function (value) {
        return typeof value !== "undefined";
    },
    has: function (obj, key) {
        return obj.hasOwnProperty(key);
    }
});

__ext_global('_', {

    is_object: function (value) {
        return typeof value === "object" && !(value instanceof Array) && !(value instanceof Node);
    },

    is_array: function (value) {
        return typeof value === "object" && value instanceof Array;
    },

    is_number: function (value) {
        return typeof value === "number";
    },

    is_truthy: function (value) {
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
                if (this.is_array(value))
                    return value.length > 0;
                for (var key in value)
                    if (value.hasOwnProperty(key) && this.is_truthy(value[key]))
                        return true;
                return false;
            default:
                return false;
        }
    },

    iterate: function (container, iterator, context) {
        context = context || this;
        var stop = false;

        if (this.is_array(container)) {
            var nativeForEach = Array.prototype.forEach;
            if (nativeForEach)
                nativeForEach.call(container, iterator, context);
            else {
                for (var i = 0; i < container.length; i++) {
                    stop = iterator.call(context, i, container[i]);
                    if (stop)
                        break;
                }
                return container
            }
        }

        if (typeof container !== "object" || container instanceof Node)
            throw "Error: The value to be iterated over should be either an array, or an object.";

        for (var key in container) {
            if (this.has(container, key)) {
                stop = iterator.call(context, key, container[key]);
                if (stop)
                    break;
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
        if (_.is_array(container)) {
            var indexOf = Array.prototype.indexOf;
            if (indexOf)
                return indexOf.call(container, item) > -1;
            for (var i = 0; i < container.length; i++) {
                if (container[i] === item)
                    return true;
            }
            return false;
        }
        // Check if item is a key in container, and the key's value is not undefined.. but would it be better to check for the actual value's presence, instead of the key's?
        else if (_.is_object(container)) {
            return container.hasOwnProperty(item) && _.is(container[item]);
        }
        else
            throw "Error: .contains(..) can't handle a container of type: '" + typeof container + "'";
    },

    flatten: function () {
        var results = [];
        for (var i = 0; i < arguments.length; i++) {
            var item = arguments[i];
            if (!_.is_array(item))
                results.push(item);
            else {
                for (var j = 0; j < item.length; j++) {
                    var value = item[j];
                    if (!_.is_array(value))
                        results.push(value);
                    else
                        results.concat(this.flatten(value));
                }
            }
        }
        return results;
    }

});


var _plates = {

        Stack: function (value) {

            this.stack = [];

            if (value)
                this.stack.push(value);

            this.top = function () {
                if (this.stack.length === 0)
                    this.push({});
                return this.stack[this.stack.length - 1];
            };

            this.push = function (value) {
                this.stack.push(value);
            };

            this.pop = function (until) {
                if (!until)
                    return this.stack.pop();
                while (this.stack.length > 0) {
                    var item = this.stack.pop();
                    if (item.type === until)
                        return item;
                }
                return null;
            };

            this.size = function () {
                return this.stack.length;
            }

        },

        Scope: function (variables) {

            this.stack = new _plates.Stack(variables);

            this.find = function (name, defaultval) {

                var current = this.stack.top();
                var value = current[name];

                if (_.is(value))
                    return value;

                if (!_.is(defaultval))
                    throw "Error: Undefined variable: '" + name + "'";

                this.assign(name, defaultval);
                return defaultval;

            };

            this.open = function () {
                var new_scope = {};
                var current = this.stack.top();
                for (var key in current) {
                    if (current.hasOwnProperty(key))
                        new_scope[key] = current[key];
                }
                this.stack.push(new_scope);
            };

            this.values = function () {
                return this.stack.top();
            };

            this.assign = function (name, value) {
                var current = this.stack.top();
                current[name] = value;
                return this;
            };

            this.close = function () {
                return this.stack.pop();
            }

        },

        ParseContext: function (sequence) {

            this.sequence = sequence;
            this.current = null;
            this.stack = new _plates.Stack();

            this.remaining = function () {
                return this.sequence.length > 0 || (this.current && this.current.type !== "(end)");
            };

            this.next = function () {
                return this.sequence.shift();
            };

        },

        Lexer: function (definitions) {

            if (!definitions)
                throw "Error: No token definitions given to Lexer.";

            this.definitions = definitions;

            this.token = function (material) {
                return this.definitions[material];
            };

            this.is_number = function (material) {
                return material.match(/^[0-9.]+$/);
            };

            this.sanitize = function (value) {
                return value.replace(/[\r\t\b\f]+/gi, '');
            };

            this.split_at_delimiter = function (inputstring, delimiter) {
                var results = [];
                var parts = inputstring.split(delimiter);
                for (var i = 0; i < parts.length; i++) {
                    var part = parts[i].trim();
                    if (part)
                        results.push(part);
                }
                return results;
            };

            this.split_by_strings = function (/*array*/ characters) {
                // Returns an array with string tokens, and other stuff for further processing

                var literal = "";
                var delimiter = null;

                while (characters.length > 0) {
                    var character = characters.shift();
                    // If we see a quote, we assume a string is starting, and move on to reading it
                    if (character === '"' || character === "'") {
                        delimiter = character;
                        break;
                    }
                    literal += character;
                }

                if (characters.length == 0)
                    return literal; // Out of input

                if (!delimiter) // No quote was encountered, so let's return whatever we accumulated, and recurse for the rest
                    return _.flatten(literal, this.split_by_strings(characters));

                // We ran into a string, so let's return whatever came before it, the string itself, and the rest through recursion
                return _.flatten(literal, this.read_string(characters, delimiter), this.split_by_strings(characters));

            };

            this.read_string = function (characters, delimiter) {
                var result = "";
                var character = "";
                while (characters.length > 0) {
                    character = characters.shift();
                    if (character === delimiter)
                        break;
                    result += character;
                }
                return {type: '(string)', value: result, lbp: 0};
            };

            this.tokenize = function (inputstring) {

                var tokens = [];
                inputstring = this.sanitize(inputstring.trim());

                var first_round = this.split_at_delimiter(inputstring, '\n');
                var second_round = [];

                for (var i = 0; i < first_round.length; i++) {
                    second_round = second_round.concat(this.split_by_strings(first_round[i].split('')));
                    second_round.push({type: '(newline)', value: '\n', lbp: 0}); // We first split the input text at newlines, so one belongs here
                }

                for (var j = 0; j < second_round.length; j++) {

                    var item = second_round[j];
                    if (typeof item === "object") {
                        tokens.push(item); // 'item' is one of the tokens from earlier rounds
                        continue;
                    }

                    var parts = second_round[j].split(' ');
                    for (var k = 0; k < parts.length; k++) {
                        var part = parts[k];
                        if (!part)
                            continue;
                        tokens = tokens.concat(this._tokenize(part));
                    }

                }

                tokens.push({type: '(end)', value: '(end)', lbp: 0});
                return tokens;

            };

            this._tokenize = function (input) {

                input = input.trim();

                if (this.token(input)) // 'input' matches a defined token
                    return this.token(input);

                if (this.is_number(input))
                    return {type: '(number)', value: _.numberize(input), lbp: 0};

                if (this.token(input.charAt(input.length - 1))) // The last character of 'input' matches a defined token
                    return _.flatten(this._tokenize(input.substring(0, input.length - 1)), this.token(input.charAt(input.length - 1)));

                if (this.token(input.charAt(0))) // The first character of 'input' matches a defined token
                    return _.flatten(this.token(input.charAt(0)), this._tokenize(input.substring(1)));

                for (var i = 0; i < input.length; i++) {
                    var character = input.charAt(i);
                    if (this.token(character)) // If the current character matches a defined token, return whatever came before it as a literal token, then the defined token itself, and recurse for handling the rest
                        return _.flatten({type: '(literal)', value: input.substring(0, i), lbp: 0}, this.token(character), this._tokenize(input.substring(i + 1)));
                }

                return {type: '(literal)', value: input, lbp: 0}

            };

        },


        Parser:     function (settings) {

            settings = settings || {};
            this.symbols = settings.symbols || {};
            this.lexer = settings.lexer;
            this.renderer = settings.renderer;
            this.filters = settings.filters || {};


            this.symbol = function (token, bp) {
                // Plain tokens are "decorated" into "Symbols". Symbols get "handlers" for prefix and/or infix operators/tokens. The idea is that a symbol "knows what to do" in a specific situation, ie. it knows how to parse whatever structure it represents, or is involved in.

                var defined = this.symbols[token.value];

                if (!defined) {
                    var sym = {lbp: bp || 0, value: token.value, type: token.type};
                    this.symbols[token.value] = sym;
                    return sym;
                }

                if (bp > defined.lbp)
                    defined.lbp = bp;

                return defined;

            };

            this.expectmsg = function (context, message) {
                return "Parse Error: Expected " + message + " but found " + context.current.type + " instead: '" + context.current.value + "'";
            };

            this.default_handlers = function (tokens, sym) {
                // These are for symbols that have no separately defined handlers. For example, a number token's "prefix" method will return a "Value" that represents the number itself. Standard operators like +, -, *, / need no special handlers either, and return a Binary expression

                sym.prefix = function (parser, context) {
                    return new _plates.n.Value(this);
                };

                sym.infix = function (parser, context, left, token) {
                    return new _plates.n.Binary(left, token, parser.expression(context, this.lbp));
                };

                return sym;

            };

            this.prefix = function (token, bp, handler) {
                return this._handler('prefix', token, bp, handler);
            };

            this.infix = function (token, bp, handler) {
                return this._handler('infix', token, bp, handler);
            };

            this._handler = function (type, token, bp, handler) {
                var sym = this.symbol(token, bp);
                if (handler)
                    sym[type] = handler;
                return sym;
            };

            this.parse = function (tokens) {

                var context = new _plates.ParseContext(tokens);

                this.consume(context); // Set up initial token
                return this.block(context);

            };

            this.content = function (context, stop_type, is_attribute) {

                var results = [];

                // We'll gather content until we see the given type of token (eg. newline)
                while (context.remaining() && context.current.type !== stop_type) {

                    if (context.current.type === "(syntax)") {
                        // "Inline" Variables etc
                        this.consume(context, '(syntax)');
                        results.push(this.expression(context, 0));
                    }
                    else {
                        // Literal content
                        results.push(context.current);
                        this.consume(context);
                    }

                    if (!context.remaining())
                        break;

                }

                if (results.length > 0)
                    return new _plates.n.Output(this, results, is_attribute);

                return null; // No content here, move on

            };

            this.skip = function (context, skip_type) {
                while (context.remaining() && context.current.type === skip_type)
                    this.consume(context);
            };

            this.statement = function (context) {
                this.consume(context, '(syntax)');
                return this.expression(context, 0);
            };

            this.is_statement = function (context) { // We're at a statement, if the current token is the "syntax marker", and the next token is a keyword (but not the 'end' -keyword)
                return context.current.type === "(syntax)" && context.sequence[0] && context.sequence[0].type === "(keyword)" && context.sequence[0].value !== "end";
            };

            this.is_block_end = function (context) { // We're at a block's end if there are no more tokens remaining, or the current token is a 'syntax marker' and the next token is the 'end' -keyword
                var is_end = !context.remaining() || (context.current.type === "(syntax)" && context.sequence[0] && context.sequence[0].value === "end");
                if (is_end) { // Discard the block's end tokens
                    this.consume(context, '(syntax)');
                    this.consume(context, '(keyword)');
                }
                return is_end;
            };

            this.block = function (context) {

                var contents = [];

                while (context.remaining()) {

                    this.skip(context, '(newline)');

                    if (this.is_block_end(context))
                        break;

                    if (this.is_statement(context)) {
                        var statement = this.statement(context);
                        if (statement)
                            contents.push(statement);
                    }
                    else {
                        var content = this.content(context, '(newline)');
                        if (content)
                            contents.push(content);
                    }

                    if (!context.remaining())
                        break;

                    if (this.is_block_end(context)) {
                        break;
                    }

                    this.skip(context, '(newline)');

                }

                return new _plates.n.Block(contents);

            };

            this.expression = function (context, rbpower) {

                rbpower = rbpower || 0;

                var token = context.current;
                this.consume(context); // After this, "token" represents the current token, but tokens.current has changed to the next token

                // Let the token decide what to do when it's the first token in an expression
                var left = token.prefix(this, context);

                // Compare the given right binding power to the left binding power of the next token (stored in "context.current" now)
                while (rbpower < context.current.lbp && context.current.type !== "(newline)") {
                    token = context.current;
                    this.consume(context);
                    left = token.infix(this, context, left, token); // How does the current token handle being between other stuff in an expression? 'left' is now a 'syntax node', ie. the result of whatever the previous token decided to do
                }

                return left;

            };

            this.consume = function (context, type, message) {

                if (type && context.current.type !== type) {
                    if (!message)
                        throw "Expected a " + type + ", but found " + context.current.type + " ('" + context.current.value + "') instead.";
                    else
                        throw message;
                }

                if (!context.remaining()) {
                    if (!type)
                        throw "Parse Error: No more Tokens";
                    else
                        throw "Parse Error: Expected a " + type + ", but there are no more Tokens left.";
                }

                var token = context.next();
                var symbol = this.symbols[token.value];

                // If a symbol has no parsing handlers defined, give it the default implementations. The default "prefix" handler returns a Value, and "infix" returns a Binary expression
                if (!symbol)
                    symbol = this.default_handlers(context, {type: token.type, lbp: 0, value: token.value});

                if (!symbol.prefix && !symbol.infix)
                    this.default_handlers(context, symbol);

                context.current = symbol;

            };

        },
        n:          { // Syntax "Nodes" - these represent the results of parsing tokens. A parsed template is basically a tree-like structure of Syntax Nodes

            Block: function (contents) {

                this.type = "Block";
                this.node = true;

                this.evaluate = function (scope, container) {

                    for (var i = 0; i < contents.length; i++) {
                        var item = contents[i];
                        if (item.type === "Output") {
                            container.appendChild(item.evaluate(scope, container));
                            if (i !== contents.length - 1) // Add a newline if this wasn't the last line of content
                                container.appendChild(document.createTextNode('\n'));
                        }
                        else
                            item.evaluate(scope, container);
                    }

                };

            },

            Ternary: function (test, trueclause, elseclause) {

                this.type = "Ternary";
                this.node = true;

                this.evaluate = function (scope, container) {

                    var result = test.evaluate(scope, container);
                    if (result)
                        return trueclause.evaluate(scope, container);

                    if (elseclause)
                        return elseclause.evaluate(scope, container);

                    return ''; // Return an empty string if there's no else clause. This way you can add to HTML content only if something is true

                };

            },

            Unary: function (operator, expression) {

                this.type = "Unary";
                this.node = true;

                this.evaluate = function (scope, container) {

                    if (operator === "not" || operator === "!")
                        return !_.is_truthy(expression.evaluate(scope, container));

                    throw "Error: Unrecognized Unary operator: '" + operator + "' " + operator;

                }

            },

            Render: function (renderer, template_expression) {

                this.type = "Render";
                this.node = true;
                this.renderer = renderer;

                this.evaluate = function (scope, container) {

                    var name = template_expression.type === "Value" ? template_expression.token.value : template_expression.evaluate(scope, container);
                    renderer.render(name, scope.values(), container);

                };

            },

            Assignment: function (target, expression) {

                this.type = "Assignment";
                this.node = true;

                this.evaluate = function (scope, container) {

                    var value = expression.evaluate(scope, container);

                    if (expression.type === "Binary" && expression.operator.type === "(logical)" && expression.operator.value === "or") {
                        if (expression.truthiness1)
                            value = expression.value1;
                        else
                            value = expression.value2;
                    }

                    scope.assign(target, value);
                    return value;

                };

            },

            Attribute: function (name_expr, value_expr) {

                this.type = "Attribute";
                this.node = true;

                this.evaluate = function (scope, container) {

                    var name = name_expr.type === "Value" ? name_expr.token.value : name_expr.evaluate(scope, container);
                    var value = value_expr.evaluate(scope, container);

                    if (!container || !container.nodeName)
                        throw "Error: a HTML Element's attribute was not given a DOM Element to attach to.";

                    switch (name) {
                        case 'class':
                            container.className = value;
                            break;
                        case 'data':
                            if (!_.is_object(value)) {
                                container.setAttribute(name, value);
                                break;
                            }
                            else {
                                // Support for setting several data-attributes in one go, from an ObjectLiteral (returned by 'value_expr')
                                _.iterate(value, function (datakey, datavalue) {
                                    container.setAttribute('data-' + datakey, datavalue);
                                });
                            }
                            break;
                        default:
                            container.setAttribute(name, value);
                    }

                };

            },

            Binary: function (operand1, operator, operand2) {

                this.type = "Binary";
                this.node = true;

                this.value1 = null;
                this.value2 = null;
                this.operand1 = operand1;
                this.operator = operator;
                this.operand2 = operand2;

                this.arithmetic = function (result1, opvalue, result2) {

                    if (opvalue === "+")
                        return result1 + result2;
                    if (opvalue === "-")
                        return result1 - result2;
                    if (opvalue === "*")
                        return result1 * result2;
                    if (opvalue === "/")
                        return result1 / result2;

                    throw "Unknown Operator: '" + opvalue + "'";

                };

                this.comparison = function (result1, opvalue, result2) {

                    if (opvalue === "==")
                        return result1 === result2;
                    if (opvalue === "!=")
                        return result1 !== result2;
                    if (opvalue === "<")
                        return result1 < result2;
                    if (opvalue === "<=")
                        return result1 <= result2;
                    if (opvalue === ">")
                        return result1 > result2;
                    if (opvalue === ">=")
                        return result1 >= result2;

                    throw "Unknown Operator: '" + opvalue + "'";

                };

                this.logical = function (val1, opvalue, val2) {

                    this.truthiness1 = _.is_truthy(val1);
                    this.truthiness2 = _.is_truthy(val2);

                    if (opvalue === "and")
                        return this.truthiness1 && this.truthiness2;

                    if (opvalue === "or")
                        return this.truthiness1 || this.truthiness2;

                    throw "Unknown Operator: '" + opvalue + "'";

                };

                this.evaluate = function (scope, container) {

                    this.value1 = this.operand1.evaluate(scope, container);
                    this.value2 = this.operand2.evaluate(scope, container);

                    var opvalue = operator.value;

                    if (operator.type === "(arithmetic)")
                        return this.arithmetic(this.value1, opvalue, this.value2);

                    if (operator.type === "(comparison)")
                        return this.comparison(this.value1, opvalue, this.value2);

                    if (operator.type === "(logical)")
                        return this.logical(this.value1, opvalue, this.value2);

                    throw "Unknown Operator: '" + opvalue + "'";

                };

            },

            Value: function (token) {

                this.type = "Value";
                this.node = true;
                this.token = token;

                this.evaluate = function (scope) {

                    if (token.type === "(string)" || token.type === "(number)")
                        return token.value;
                    if (token.type === "(literal)")
                        return scope.find(token.value);

                    if (token.type === "(true)")
                        return true;
                    if (token.type === "(false)")
                        return false;
                    if (token.type === "(null)")
                        return null;

                    throw "Unknown Value type: " + token.type + " ('" + token.value + "')";

                };

            },

            External: function (variable) { // This represents an external variable, for example from the 'document' scope

                this.type = "External";
                this.node = true;

                this.evaluate = function (scope) {
                    return variable;
                };

            },

            IfStatement: function () {

                this.type = "IfStatement";
                this.node = true;

                this.branches = [];

                this.branch = function (test, block) {
                    this.branches.push({test: test, block: block});
                    return this;
                };

                this.evaluate = function (scope, container) {
                    for (var i = 0; i < this.branches.length; i++) {
                        var branch = this.branches[i];
                        if (_.is_truthy(branch.test.evaluate(scope, container))) {
                            branch.block.evaluate(scope, container);
                            break; // Only evaluate the first truthy block
                        }
                    }
                };

                this.finalize = function () {
                    // Else blocks get to add their branches before the main if-statement, so we need to reverse their order
                    this.branches.reverse();
                }

            },

            ForLoop: function (names, for_expression, block) {

                this.type = "Loop";
                this.node = true;

                this.cycler = function (index) {
                    return function () {
                        return arguments[index % arguments.length];
                    }
                };

                this.process = function (scope, container, bindings, block, loop) {
                    scope.open();
                    _.iterate(bindings, function (name, value) {
                        scope.assign(name, value);
                    });
                    scope.assign('loop', loop);
                    var result = block.evaluate(scope, container);
                    scope.close();
                    return result;
                };

                this.array = function (scope, container, array, block) {

                    var results = [];

                    for (var i = 0; i < array.length; i++) {

                        var item = array[i];
                        var bindings = {};

                        var loop = {index: i + 1, even: (i + 1) % 2 == 0, odd: (i + 1) % 2 != 0, first: i == 0, last: i == array.length - 1, total: array.length, cycle: this.cycler(i)};

                        if (_.is_array(item)) {

                            if (names.length !== item.length)
                                throw "Error: Binding mismatch: Expected values for " + names.length + " names when looping over a sequence of arrays, but got only " + item.length + ".";

                            for (var j = 0; j < names.length; j++)
                                bindings[names[j].value] = item[j];

                            results.push(this.process(scope, container, bindings, block, loop));

                        }
                        else {

                            if (names.length > 1)
                                throw "Error: Binding mismatch: More than one variable name specified for a for-loop, but only one value available.";

                            bindings[names[0].value] = item; // Since the current item is not an array and not an object, it should be a string or a number
                            results.push(this.process(scope, container, bindings, block, loop));

                        }

                    }

                    return results;

                };

                this.object = function (scope, container, object, block) {

                    if (names.length != 2)
                        throw "Error: Looping over an object's keys and values requires using two variable names. Now there are " + names.length;

                    var results = [];
                    var keys = Object.keys(object);

                    for (var i = 0; i < keys.length; i++) {

                        var loop = {index: i + 1, even: i % 2 == 0, odd: i % 2 != 0, first: i == 0, last: i == keys.length - 1, total: keys.length, cycle: this.cycler(i)};
                        var key = keys[i];

                        var bindings = {};
                        bindings[names[0].value] = key;
                        bindings[names[1].value] = object[key];

                        results.push(this.process(scope, container, bindings, block, loop));

                    }

                    return results;

                };

                this.evaluate = function (scope, container) {

                    var exprvalue = for_expression.evaluate(scope, container);

                    if (_.is_array(exprvalue))
                        this.array(scope, container, exprvalue, block);

                    else if (_.is_object(exprvalue))
                        this.object(scope, container, exprvalue, block);

                    else
                        throw "Error: Can't loop over something that's not an array or an object.";

                };

            },

            FunctionCall: function (variable, call_args) {

                this.type = "Call";
                this.node = true;
                this.variable = variable;

                this.evaluate = function (scope, container) {

                    var args = [];
                    var target = this.variable.evaluate(scope, container);

                    for (var i = 0; i < call_args.length; i++) {
                        var arg_expr = call_args[i];
                        args.push(arg_expr.evaluate(scope, container));
                    }

                    return target.apply(container || this, args);

                }

            },

            Filter: function (filters, valueexpr, filterchain) {

                this.type = "Filter";
                this.node = true;
                this.filters = filters;

                this.evaluate = function (scope, container) {

                    var result = valueexpr.evaluate(scope, container);

                    for (var i = 0; i < filterchain.length; i++) {

                        var name = filterchain[i].value;
                        var filter = this.filters[name];

                        if (!filter)
                            throw "Error: No filter found by name: '" + name + "'";

                        if (typeof filter !== "function")
                            throw "Error: Invalid filter: '" + name + "' is not a function.";

                        result = filter(result);

                    }

                    return result;

                }

            },

            Accessor: function (container, names, name_is_expression) {

                this.type = "Accessor";
                this.node = true;

                this.evaluate = function (scope) {

                    var _object = container.evaluate(scope);
                    var first_in_chain = true;

                    if (name_is_expression) {
                        // We're accessing something with the square bracket syntax, like: object[name] or array[index]
                        var accessor = names.evaluate(scope, container);
                        if (_.is_array(_object)) {
                            if (!_.is_number(accessor))
                                throw "Error: Tried to access an array with a non-numerical index value: '" + accessor + "'";
                            return _object[accessor];
                        }
                        else if (_.is_object(_object))
                            return _object[accessor];
                        else
                            throw "Error: Can't access a container of type: " + typeof _object;
                    }

                    // Otherwise, names are just tokens and we might end up going through an object hierarchy
                    for (var i = 0; i < names.length; i++) {
                        var name = names[i];
                        _object = _object[name.value];
                        if (!_.is(_object)) {
                            if (first_in_chain)
                                throw "Error: Undefined variable: '" + container.token.value + "." + name.value + "'";
                            else
                                throw "Error: Undefined variable: '" + names[i - 1].value + "." + name.value + "'";
                        }
                        first_in_chain = false;
                    }

                    return _object;

                }

            },

            Member: function (value_expr, container_expr) {

                this.type = "Member";
                this.node = true;

                this.evaluate = function (scope, container) {
                    var value = value_expr.evaluate(scope, container);
                    var valuecontainer = container_expr.evaluate(scope, container);
                    return _.contains(valuecontainer, value);
                }

            },

            ArrayLiteral: function (elements) {

                this.type = "Array";
                this.node = true;

                this.evaluate = function (scope) {
                    var results = [];
                    for (var i = 0; i < elements.length; i++) {
                        var elem_expr = elements[i];
                        results.push(elem_expr.evaluate(scope));
                    }
                    return results;
                };

            },

            ObjectLiteral: function (members) {

                this.type = "Object";
                this.node = true;

                this.evaluate = function (scope, container) {
                    var result = {};
                    for (var i = 0; i < members.length; i++) {
                        var kvpair = members[i];
                        var name = kvpair.name.type === "Value" ? kvpair.name.token.value : kvpair.name.evaluate(scope, container);
                        if (!name)
                            throw "Error: No name for an object literal member's value.";
                        result[name] = kvpair.value.evaluate(scope, container);
                    }
                    return result;
                };

            },

            Output: function (parser, contents, is_attribute) {

                this.type = "Output";
                this.node = true;
                this.contents = contents;

                // Dirty trickery to avoid mucking up CSS definitions with spaces that don't belong there
                // when we happen to be outputting a HTML element's style-attribute (eg. style="margin - left : 1em;" etc)
                this.nospaceL = {'-': true, '_': true, ':': true, ';': true, '.': true};
                this.nospaceR = {'-': true, '_': true, '.': true};

                this.get_value = function (item, scope, container) {
                    if (!item) return null;
                    if (!item.node)
                        return item.value;
                    return item.evaluate(scope, container);
                };

                this.evaluate = function (scope, container) {

                    var results = [];

                    for (var i = 0; i < contents.length; i++) {
                        var value = this.get_value(contents[i], scope, container), next = this.get_value(contents[i + 1], scope, container);

                        if (!is_attribute && next) {
                            value = value + " ";
                        }
                        else {

                            if (!this.nospaceR[value] && next && !this.nospaceL[next])
                                value = value + " ";

                        }

                        results.push(value);

                    }

                    if (is_attribute) // We're dealing with a HTML Element's attribute, so just return the resulting string value
                        return results.join('');
                    else // Return a proper DOM element, in order for a Block to insert it into its container
                        return document.createTextNode(results.join(''));

                }

            },

            HtmlElement: function (name, modifiers, body, is_expr_body) {

                this.type = "Element";
                this.node = true;

                this.evaluate = function (scope, container) {

                    if (name.type !== "Value")
                        throw "Error: A HTML Element's name should be a simple Value expression, found: " + name.type + " instead.";

                    var element = document.createElement(name.token.value);

                    for (var i = 0; i < modifiers.length; i++)
                        modifiers[i].evaluate(scope, element);

                    if (is_expr_body) {
                        var exprvalue = body.evaluate(scope, container);
                        if (exprvalue)
                            element.appendChild(document.createTextNode(exprvalue));
                    }

                    // The element just created will now be the "container" for all expressions below this one.
                    else if (body && body !== null) {
                        body.evaluate(scope, element);
                    }

                    container.appendChild(element);

                };

            }

        },
        extensions: function (type, identifier) {
            if (type === "element.modifier") {
                if (identifier === "click") {
                    return function (name_or_func) {

                        var args = Array.prototype.slice.call(arguments, 1); // Get whatever arguments were defined after the external function's name, like "elem div click(func_name, 'arg1', 'arg2')"

                        // Get the external function to act as our click handler
                        var func = typeof name_or_func === "function" ? name_or_func : null;
                        if (!func) {
                            func = window[name_or_func];
                            if (!func)
                                throw "Error: Click handler '" + name_or_func.toString() + "' not found in the Window scope.";
                        }

                        this.addEventListener('click', function (evt) {func.apply(this, [evt].concat(args))}, true); // A wrapper to pass the arguments given to this function on to the click handler function

                    };
                }
            }
            // No extension by the given type/identifier
            return null;
        }
    }
    ;


var Plates = function (classname, settings) {

    settings = settings || {};
    var extensions = settings.extensions || _plates.extensions;

    var _token = function (type, value) {
        return {type: type, value: value, lbp: 0};
    };

    var tokens = {
        '+':      _token('(arithmetic)', '+'),
        '-':      _token('(arithmetic)', '-'),
        '*':      _token('(arithmetic)', '*'),
        '/':      _token('(arithmetic)', '/'),
        '==':     _token('(comparison)', '=='),
        '!=':     _token('(comparison)', '!='),
        '<':      _token('(comparison)', '<'),
        '<=':     _token('(comparison)', '<='),
        '>':      _token('(comparison)', '>'),
        '>=':     _token('(comparison)', '>='),
        'and':    _token('(logical)', 'and'),
        'or':     _token('(logical)', 'or'),
        'in':     _token('(logical)', 'in'),
        'not':    _token('(logical)', 'not'),
        '=':      _token('(assignment)', '='),
        '\n':     _token('(newline)', '\n'),
        '?':      _token('(delimiter)', '?'),
        ':':      _token('(delimiter)', ':'),
        '(':      _token('(delimiter)', '('),
        ')':      _token('(delimiter)', ')'),
        '.':      _token('(delimiter)', '.'),
        ',':      _token('(delimiter)', ','),
        '[':      _token('(delimiter)', '['),
        ']':      _token('(delimiter)', ']'),
        '{':      _token('(delimiter)', '{'),
        '}':      _token('(delimiter)', '}'),
        '|':      _token('(delimiter)', '|'),
        'for':    _token('(keyword)', 'for'),
        'if':     _token('(keyword)', 'if'),
        'else':   _token('(keyword)', 'else'),
        'end':    _token('(keyword)', 'end'),
        'render': _token('(keyword)', 'render'),
        'elem':   _token('(keyword)', 'elem'),
        'elex':   _token('(keyword)', 'elex'),
        'null':   _token('(null)', 'null'),
        'true':   _token('(true)', 'true'),
        'false':  _token('(false)', 'false'),
        '@':      _token('(syntax)', '@'),
        '#':      _token('(comment)', '#')
    };

    var lexer = new _plates.Lexer(tokens);
    var parser = new _plates.Parser({filters: settings.filters, symbols: tokens, lexer: lexer, renderer: this});

    var expr_delimiter = function (parser, context, errmsg) {
        var expr = parser.expression(context, 0);
        parser.consume(context, '(delimiter)', errmsg);
        return expr;
    };

    parser.prefix(tokens['if'], 0, function (parser, context) {

        var test = expr_delimiter(parser, context, parser.expectmsg(context, "a colon (':') to mark an if-statement's block starting"));

        var if_statement = new _plates.n.IfStatement();
        context.stack.push(if_statement);

        if_statement.branch(test, parser.block(context));
        if_statement.finalize();

        return if_statement;

    });

    parser.prefix(tokens['else'], 0, function (parser, context) {

        var if_statement = context.stack.pop('IfStatement');

        if (!if_statement || if_statement.type !== "IfStatement")
            throw "Parse Error: No if-statement found in the parsing context. Can't handle an else-clause without one.";

        var test = {evaluate: function (dummy) {return true;}, type: 'Dummy'};
        var missing_colon = parser.expectmsg(context, "a colon (':') to mark an else-block starting");

        if (context.current.value === "if") {
            parser.consume(context, '(keyword)');
            context.stack.push(if_statement); // Put the if-statement back in, because this if might have another else-clause
            test = expr_delimiter(parser, context, missing_colon);
        }

        else {
            parser.consume(context, '(delimiter)', missing_colon);
        }

        if_statement.branch(test, parser.block(context));
        return null;

    });

    parser.prefix(tokens['for'], 0, function (parser, context) {

        var names = [];
        while (context.current.value !== "in") {
            names.push(context.current);
            parser.consume(context, '(literal)');
            if (context.current.value !== ",")
                break;
            parser.consume(context, "(delimiter)");
        }

        parser.consume(context, '(logical)', parser.expectmsg(context, "keyword 'in' after a For Loop's variable names"));
        var container = parser.expression(context, 0);

        var forblock = null;
        if (context.current.value === ":") {
            parser.consume(context, '(delimiter)', parser.expectmsg(context, "a colon (':') after a For Loop's container expression"));
            forblock = parser.block(context);
        }
        else {
            if (context.current.type === "(newline)")
                throw "Parse Error: No body for a for-loop, but no expression to be used as a body either.";
            forblock = parser.expression(context, 0);
        }

        return new _plates.n.ForLoop(names, container, forblock);

    });

    parser.prefix(tokens['not'], 80, function (parser, context) {

        return new _plates.n.Unary('not', parser.expression(context, 0));

    });

    parser.prefix(tokens['render'], 0, function (parser, context) {

        return new _plates.n.Render(parser.renderer, parser.expression(context, 0));

    });

    var modifier_extension = function (modifier) {
        if (modifier.type !== "Call")
            return modifier;
        var identifier = modifier.variable.token.value; // FunctionCalls have a "Value" -node as their 'variable'
        var extension = extensions('element.modifier', identifier); // Check if there's an extension for this element modifier
        if (extension) // Replace the Call's 'variable' with the extension, ie. the external function call. This way the extension will get called by FunctionCall when the template is evaluated
            modifier.variable = new _plates.n.External(extension);
        return modifier;
    };

    parser.prefix(tokens['elem'], 0, function (parser, context) {

        var elemname = parser.expression(context, 0);
        if (elemname.type !== "Value")
            throw "Parse Error: Expected an Element name ('div', 'span', etc) but found " + elemname.type + " instead.";

        var modifiers = [];
        while (context.remaining() && context.current.value !== ":" && context.current.type !== "(newline)")
            modifiers.push(modifier_extension(parser.expression(context, 0)));

        if (context.current.type === "(newline)") // No body for element
            return new _plates.n.HtmlElement(elemname, modifiers, null, false);

        parser.consume(context, '(delimiter)', parser.expectmsg(context, "a colon to mark the beginning of a HTML Element's body"));
        return new _plates.n.HtmlElement(elemname, modifiers, parser.block(context), false);

    });

    parser.prefix(tokens['elex'], 0, function (parser, context) {

        var elemname = parser.expression(context, 0);
        if (elemname.type !== "Value")
            throw "Parse Error: Expected an element name ('div', 'span', etc) but found " + elemname.type + " instead.";

        var modifiers = [];
        while (context.remaining() && context.current.value !== ":" && context.current.type !== "(newline)")
            modifiers.push(modifier_extension(parser.expression(context, 0)));

        if (modifiers.length === 0)
            throw "Parse Error: An element introduced with 'elex' needs an expression to be used as its body.";

        var exprbody = modifiers.pop();
        if (exprbody.type === "Attribute")
            throw "Parse Error: The expression for an element's body should be something that returns a value. Found an 'Attribute' instead.";

        return new _plates.n.HtmlElement(elemname, modifiers, exprbody, true);

    });

    parser.prefix(tokens['('], 80, function (parser, context) {
        var expr = parser.expression(context, 0);
        parser.consume(context, '(delimiter)');
        return expr
    });

    parser.prefix(tokens['['], 80, function (parser, context) {

        var elements = [];

        while (context.current.value !== "]") {
            elements.push(parser.expression(context, 0));
            if (context.current.value !== ",")
                break;
            parser.consume(context, "(delimiter)");
        }

        parser.consume(context, "(delimiter)");
        return new _plates.n.ArrayLiteral(elements);

    });

    parser.prefix(tokens['{'], 80, function (parser, context) {

        var members = [];

        while (context.current.value !== "}") {
            var name = parser.expression(context, 0);
            if (context.current.value !== ":")
                throw parser.expectmsg(context, "a colon (:) after the name of a variable in an object literal");
            parser.consume(context, "(delimiter)");
            members.push({name: name, value: parser.expression(context, 0)});
            if (context.current.value !== ",")
                break;
            parser.consume(context, "(delimiter)");
        }

        parser.consume(context, "(delimiter)"); // Discard }
        return new _plates.n.ObjectLiteral(members);

    });

    parser.prefix(tokens['#'], 0, function (parser, context) {
        // Discard the rest of the line as a comment
        while (context.remaining() && context.current.type !== "(newline)")
            parser.consume(context);
    });

    this.default_infix_right = function (parser, context, left, token) {
        return new _plates.n.Binary(left, token, parser.expression(context, this.lbp - 1));
    };

    parser.infix(tokens['('], 80, function (parser, context, left) {

        var args = [];

        while (context.current.value !== ")") {
            args.push(parser.expression(context, 0));
            if (context.current.value !== ",")
                break;
            parser.consume(context, "(delimiter)");
        }

        parser.consume(context, "(delimiter)");
        return new _plates.n.FunctionCall(left, args);

    });

    parser.infix(tokens['['], 80, function (parser, context, container) {

        var name = parser.expression(context, 0);

        if (context.current.value !== "]")
            throw parser.expectmsg(context, "a closing bracket ']' after the name of the variable to be accessed");
        parser.consume(context, "(delimiter)");

        return new _plates.n.Accessor(container, name, true);

    });

    parser.infix(tokens['.'], 80, function (parser, context, left) {

        var names = [];
        while (true) {
            if (!context.remaining())
                break;
            names.push(context.current);
            parser.consume(context);
            if (context.current.value !== ".")
                break;
            parser.consume(context);
        }

        return new _plates.n.Accessor(left, names);

    });

    parser.infix(tokens['in'], 80, function (parser, context, left) {

        var container = parser.expression(context, 0);
        return new _plates.n.Member(left, container);

    });

    parser.infix(tokens['|'], 80, function (parser, context, left) {

        if (!parser.filters)
            throw "Error: Filter expression encountered, but no filters defined.";

        var filters = [];
        while (true) {

            if (!context.remaining())
                break;

            filters.push(context.current);
            parser.consume(context);

            if (context.current.value !== "|")
                break;
            parser.consume(context);

        }

        return new _plates.n.Filter(parser.filters, left, filters);

    });

    parser.infix(tokens['?'], 20, function (parser, context, left, token) {
        var trueclause = parser.expression(context, 0);
        if (context.current.type !== "(delimiter)")
            return new _plates.n.Ternary(left, trueclause, null);

        parser.consume(context, "(delimiter)");
        var elseclause = parser.expression(context, 0);

        return new _plates.n.Ternary(left, trueclause, elseclause);
    });

    parser.infix(tokens['+'], 50);
    parser.infix(tokens['-'], 50);
    parser.infix(tokens['*'], 60);
    parser.infix(tokens['/'], 60);

    parser.infix(tokens['=='], 40);
    parser.infix(tokens['!='], 40);
    parser.infix(tokens['<'], 40);
    parser.infix(tokens['<='], 40);
    parser.infix(tokens['>'], 40);
    parser.infix(tokens['>='], 40);

    parser.infix(tokens['and'], 30, this.default_infix_right);
    parser.infix(tokens['or'], 30, this.default_infix_right);

    parser.infix(tokens['='], 10, function (parser, context, left) {

        if (left.type !== "Value")
            throw "Parse Error: Attribute name expected, found " + left.type + " instead.";

        var attr_value = parser.expression(context, 0);

        // If the attribute value is a raw string, we tokenize & parse it to enable inline expressions
        if (attr_value.type === "Value" && attr_value.token.type === "(string)") {
            var attr_context = new _plates.ParseContext(lexer.tokenize(attr_value.token.value));
            parser.consume(attr_context); // Set up initial token
            attr_value = parser.content(attr_context, '(newline)', true);
        }

        return new _plates.n.Attribute(left, attr_value);

    });

    this.parsed = {};
    var elements = document.getElementsByClassName(classname);

    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        var name = element.getAttribute('data-name') || element.id;
        if (!name)
            throw "Error: An element with the class name: '" + classname + "' has no 'id' and no 'data-name' defined. Templates are rendered by name, so you need to name it with either of those attributes.";
        var tokenized = lexer.tokenize(element.innerHTML);
        this.parsed[name] = parser.parse(tokenized);
    }

    this.render = function (name, variables, container) {
        var template = this.parsed[name];
        if (!template)
            throw "Error: No Template found by name: '" + name + "'";
        var scope = new _plates.Scope(variables);
        if (!container) {
            container = document.createElement('div');
            container.className = "__template__";
        }
        template.evaluate(scope, container);
        return container;
    };

};

