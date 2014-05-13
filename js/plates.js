// Plates JS - Logic-ful templating for JavaScript
var _plates = {

    Stack: function (value) {

        this.stack = [];

        if (value)
            this.stack.push(value);

        this.topValue = function () {
            if (this.stack.length === 0)
                this.pushValue({});
            return this.stack[this.stack.length - 1];
        };

        this.pushValue = function (value) {
            this.stack.push(value);
        };

        this.popValue = function (until) {
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

            var current = this.stack.topValue();
            var value = current[name];

            if (_.is(value))
                return value;

            if (!_.is(defaultval))
                return undefined;

            this.assign(name, defaultval);
            return defaultval;

        };

        this.open = function () {
            var new_scope = {};
            var current = this.stack.topValue();
            for (var key in current) {
                if (current.hasOwnProperty(key))
                    new_scope[key] = current[key];
            }
            this.stack.pushValue(new_scope);
        };

        this.values = function () {
            return this.stack.topValue();
        };

        this.assign = function (name, value) {
            var current = this.stack.topValue();
            current[name] = value;
            return this;
        };

        this.close = function () {
            return this.stack.popValue();
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
            throw "TemplateError: No token definitions given to Lexer.";

        this.definitions = definitions;

        this.token = function (material) {
            return this.definitions[material];
        };

        this.isNumber = function (material) {
            return material.match(/^[0-9.]+$/);
        };

        this.sanitize = function (value) {
            return value.replace(/[\r\t\b\f]+/gi, '');
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

            var first_round = _.split(inputstring, '\n');
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

            if (this.isNumber(input))
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

    Parser: function (settings) {

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
            return "TemplateError: Expected " + message + " but found " + context.current.type + " instead: '" + context.current.value + "'";
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
                    // "Inline" Variables, ie. variables found within an element's contents
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

            // Combine expressions into an operator/token's operands through calling the infix method of upcoming tokens, until we meet a token with a higher binding power
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
                    throw "TemplateError: Expected a " + type + ", but found " + context.current.type + " ('" + context.current.value + "') instead.";
                else
                    throw message;
            }

            if (!context.remaining()) {
                if (!type)
                    throw "TemplateError: No more Tokens";
                else
                    throw "TemplateError: Expected a " + type + ", but there are no more Tokens left.";
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
    n: { // Syntax "Nodes" - these represent the results of parsing tokens. A parsed template is a tree-like structure of Syntax Nodes

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
                    return !_.isTruthy(expression.evaluate(scope, container));

                throw "TemplateError: Unrecognized Unary operator: '" + operator + "' " + operator;

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
                    throw "TemplateError: a HTML Element's attribute was not given a DOM Element to attach to.";

                switch (name) {
                    case 'class':
                        container.className = value;
                        break;
                    case 'data':
                        if (!_.isObject(value)) {
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

                this.truthiness1 = _.isTruthy(val1);
                this.truthiness2 = _.isTruthy(val2);

                if (opvalue === "and")
                    return this.truthiness1 && this.truthiness2;

                if (opvalue === "or") {
                    if (!this.truthiness1) {
                        if (this.truthiness2)
                            return val2;
                        else
                            return false;
                    }
                    return val1;
                }

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
                if (token.type === "(literal)") {
                    var result = scope.find(token.value);
                    if (result === undefined)
                        return window[token.value];
                    return result;
                }

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
                return variable; // When called, just return the variable as it was set.
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
                    if (_.isTruthy(branch.test.evaluate(scope, container))) {
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

        ForLoop: function (names, for_expression) {

            this.type = "Loop";
            this.node = true;

            this.body = null;
            this.elseBlock = null;

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

                    if (_.isArray(item)) {

                        if (names.length !== item.length)
                            throw "TemplateError: Binding mismatch: Expected values for " + names.length + " names when looping over a sequence of arrays, but got only " + item.length + ".";

                        for (var j = 0; j < names.length; j++)
                            bindings[names[j].value] = item[j];

                        results.push(this.process(scope, container, bindings, block, loop));

                    }
                    else {

                        if (names.length > 1)
                            throw "TemplateError: Binding mismatch: More than one variable name specified for a for-loop, but only one value available.";

                        bindings[names[0].value] = item; // Since the current item is not an array and not an object, it should be a string or a number
                        results.push(this.process(scope, container, bindings, block, loop));

                    }

                }

                return results;

            };

            this.object = function (scope, container, object, block) {

                if (names.length != 2)
                    throw "TemplateError: Looping over an object's keys and values requires using two variable names. Now there are " + names.length;

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

                if (exprvalue == null && this.elseBlock !== null)
                    this.elseBlock.evaluate(scope, container);

                if (_.isArray(exprvalue)) {
                    if (exprvalue.length === 0 && this.elseBlock !== null)
                        this.elseBlock.evaluate(scope, container);
                    else
                        this.array(scope, container, exprvalue, this.body);
                }

                else if (_.isObject(exprvalue)) {
                    if (Object.keys(exprvalue).length === 0 && this.elseBlock !== null)
                        this.elseBlock.evaluate(scope, container);
                    else
                        this.object(scope, container, exprvalue, this.body);
                }

                else
                    throw "TemplateError: Can't loop over something that's not an array or an object.";

            };

        },

        FunctionCall: function (variable, call_args) {

            this.type = "Call";
            this.node = true;
            this.variable = variable;

            this.evaluate = function (scope, container) {

                var args = [];
                var target = this.variable.evaluate(scope, container);

                for (var i = 0; i < call_args.length; i++)
                    args.push(call_args[i].evaluate(scope, container));

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
                        throw "TemplateError: No filter found by name: '" + name + "'";

                    if (typeof filter !== "function")
                        throw "TemplateError: Invalid filter: '" + name + "' is not a function.";

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
                    if (_.isArray(_object)) {
                        if (!_.isNumber(accessor))
                            throw "TemplateError: Tried to access an array with a non-numerical index value: '" + accessor + "'";
                        return _object[accessor];
                    }
                    else if (_.isObject(_object))
                        return _object[accessor];
                    else
                        throw "TemplateError: Can't access a container of type: " + typeof _object;
                }

                // Otherwise, names are just tokens and we might end up going through an object hierarchy: something.with.inner.values
                for (var i = 0; i < names.length; i++) {
                    var name = names[i];
                    _object = _object[name.value];
                    if (!_.is(_object)) {
                        if (first_in_chain)
                            throw "TemplateError: Undefined variable: '" + container.token.value + "." + name.value + "'";
                        else
                            throw "TemplateError: Undefined variable: '" + names[i - 1].value + "." + name.value + "'";
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
                        throw "TemplateError: No name for an object literal member's value.";
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
                    throw "TemplateError: A HTML Element's name should be a simple Value expression, found: " + name.type + " instead.";

                var element = document.createElement(name.token.value);
                element['_component_'] = container['_component_']; // This is related to supporting an UI framework, feel free to ignore.

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
        if (type === "element/modifier") {
            if (identifier === "click") {
                return function (name_or_func) {

                    var args = Array.prototype.slice.call(arguments, 1); // Get whatever arguments were defined after the external function's name, like "elem div click(func_name, 'arg1', 'arg2')"

                    // Get the external function to act as our click handler
                    var func = typeof name_or_func === "function" ? name_or_func : null;
                    if (!func) {
                        func = window[name_or_func];
                        if (!func)
                            throw "TemplateError: Click handler '" + name_or_func.toString() + "' not found in the Window scope.";
                    }

                    this.addEventListener('click', function (evt) {
                        func.apply(this, [evt].concat(args))
                    }, true); // A wrapper to pass the arguments given to this function on to the click handler function

                };
            }
        }
        // No extension by the given type/identifier
        return null;
    }
};

var Plates = function (classname, settings) {

    settings = settings || {};
    var extensions = settings.extensions || tectonic.extensions || _plates.extensions;

    var _token = function (type, value) {
        return {type: type, value: value, lbp: 0};
    };

    var tokens = {
        '+': _token('(arithmetic)', '+'),
        '-': _token('(arithmetic)', '-'),
        '*': _token('(arithmetic)', '*'),
        '/': _token('(arithmetic)', '/'),
        '==': _token('(comparison)', '=='),
        '!=': _token('(comparison)', '!='),
        '<': _token('(comparison)', '<'),
        '<=': _token('(comparison)', '<='),
        '>': _token('(comparison)', '>'),
        '>=': _token('(comparison)', '>='),
        'and': _token('(logical)', 'and'),
        'or': _token('(logical)', 'or'),
        'in': _token('(logical)', 'in'),
        'not': _token('(logical)', 'not'),
        '=': _token('(assignment)', '='),
        '\n': _token('(newline)', '\n'),
        '?': _token('(delimiter)', '?'),
        ':': _token('(delimiter)', ':'),
        '(': _token('(delimiter)', '('),
        ')': _token('(delimiter)', ')'),
        '.': _token('(delimiter)', '.'),
        ',': _token('(delimiter)', ','),
        '[': _token('(delimiter)', '['),
        ']': _token('(delimiter)', ']'),
        '{': _token('(delimiter)', '{'),
        '}': _token('(delimiter)', '}'),
        '|': _token('(delimiter)', '|'),
        'for': _token('(keyword)', 'for'),
        'if': _token('(keyword)', 'if'),
        'else': _token('(keyword)', 'else'),
        'end': _token('(keyword)', 'end'),
        'render': _token('(keyword)', 'render'),
        'elem': _token('(keyword)', 'elem'),
        'elex': _token('(keyword)', 'elex'),
        'null': _token('(null)', 'null'),
        'true': _token('(true)', 'true'),
        'false': _token('(false)', 'false'),
        '@': _token('(syntax)', '@'),
        '##': _token('(comment)', '##')
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
        context.stack.pushValue(if_statement);

        if_statement.branch(test, parser.block(context));
        if_statement.finalize();

        return if_statement;

    });

    parser.prefix(tokens['else'], 0, function (parser, context) {

        var statement = context.stack.popValue();
        if (!statement)
            throw "TemplateError: Encountered an 'else' -clause, but there's no statement to attach it to.";

        var missing_colon = parser.expectmsg(context, "a colon (':') to mark an else -block starting");

        if (statement.type === "Loop") {

            parser.consume(context, '(delimiter)', missing_colon);
            statement.elseBlock = parser.block(context);

        }

        else if (statement.type === "IfStatement") {

            var test = {evaluate: function (dummy) { // Prepare a dummy test if there's no 'else if' coming up
                return true;
            }, type: 'Dummy'};

            if (context.current.value === "if") { // Read another test for an 'else if'
                parser.consume(context, '(keyword)');
                context.stack.pushValue(statement); // Put the if-statement back in, because this if might have another else-clause
                test = expr_delimiter(parser, context, missing_colon);
            }

            else {
                parser.consume(context, '(delimiter)', missing_colon);
            }

            statement.branch(test, parser.block(context));

        }
        else
            throw "TemplateError: Can't handle an 'else' -clause for a statement of type: '" + statement.type + "'";

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
        var loop_over_thing = parser.expression(context, 0);

        var forLoop = new _plates.n.ForLoop(names, loop_over_thing);
        context.stack.pushValue(forLoop);

        if (context.current.value === ":") {
            parser.consume(context, '(delimiter)', parser.expectmsg(context, "a colon (':') after a For Loop's container expression"));
            forLoop.body = parser.block(context);
        }
        else {
            if (context.current.type === "(newline)")
                throw "TemplateError: No body for a for-loop, but no expression to be used as a body either.";
            forLoop.body = parser.expression(context, 0);
        }

        return forLoop;

    });

    parser.prefix(tokens['not'], 80, function (parser, context) {

        return new _plates.n.Unary('not', parser.expression(context, 0));

    });

    parser.prefix(tokens['render'], 0, function (parser, context) {

        return new _plates.n.Render(parser.renderer, parser.expression(context, 0));

    });

    var read_element_modifier = function (expression) {
        if (expression.type !== "Call") // Nevermind, there's no 'modifier' - just some other expression (like an attribute, perhaps)
            return expression;
        // We're dealing with a function call expression here. It's possible to extend Plates with function calls that add functionality to the DOM Nodes they're attached to.
        var identifier = expression.variable.token.value; // FunctionCalls have a "Value" -node as their 'variable' (eg. the "click" in "click(something)")
        var extension = extensions('element/modifier', identifier); // Check if there's an extension for this element modifier (Call). For example, is there an extension for "click"?
        if (extension) // Replace the Call expression's 'variable' with the extension, ie. the external function call. This way the extension will get called by FunctionCall when the template is evaluated
            expression.variable = new _plates.n.External(extension);
        return expression;
    };

    var read_elem_name_and_mods = function (parser, context, ignoreNewLines) {

        var elemname = parser.expression(context, 0);
        if (elemname.type !== "Value")
            throw "TemplateError: Expected an Element name ('div', 'span', etc) but found " + elemname.type + " instead.";

        var modifiers = [];
        while (context.remaining() && context.current.value !== ":") {

            if (context.current.type === "(newline)") {
                if (ignoreNewLines)
                    parser.consume(context, '(newline)');
                else
                    break;
            }

            modifiers.push(read_element_modifier(parser.expression(context, 0)));
        }

        return {name: elemname, mods: modifiers};

    };

    parser.prefix(tokens['elem'], 0, function (parser, context) {

        var elem = read_elem_name_and_mods(parser, context, true);

        if (context.current.type === "(newline)") // No body for element
            return new _plates.n.HtmlElement(elem.name, elem.mods, null, false);

        parser.consume(context, '(delimiter)', parser.expectmsg(context, "a colon to mark the beginning of a HTML Element's body"));
        return new _plates.n.HtmlElement(elem.name, elem.mods, parser.block(context), false);

    });

    parser.prefix(tokens['elex'], 0, function (parser, context) {

        var elem = read_elem_name_and_mods(parser, context, false);

        if (elem.mods.length === 0)
            throw "TemplateError: An element introduced with 'elex' needs an expression to be used as its body.";

        var exprbody = elem.mods.pop();
        if (exprbody.type === "Attribute")
            throw "TemplateError: The expression for an element's body should be something that returns a value. Found a '" + exprbody.type + "' instead.";

        return new _plates.n.HtmlElement(elem.name, elem.mods, exprbody, true);

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
            while (context.current.type === "(newline)")
                parser.consume(context);

            if (context.current.value !== ",")
                break;

            while (context.current.type === "(newline)")
                parser.consume(context);

            parser.consume(context, "(delimiter)", "Expected a comma to separate Array literal members.");

        }

        parser.consume(context, "(delimiter)");
        return new _plates.n.ArrayLiteral(elements);

    });

    parser.prefix(tokens['{'], 80, function (parser, context) {

        var members = [];

        while (context.current.value !== "}") {

            while (context.current.type === "(newline)")
                parser.consume(context);

            var name = parser.expression(context, 0);
            while (context.current.type === "(newline)")
                parser.consume(context);

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

    parser.prefix(tokens['##'], 0, function (parser, context) {
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

            if (context.current.type === "(newline)")
                parser.consume(context);

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
            throw "TemplateError: Filter expression encountered, but no filters defined.";

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
            throw "TemplateError: Attribute name expected, found " + left.type + " instead.";

        var attr_value = parser.expression(context, 0);

        // If the attribute value is a raw string, we tokenize & parse it to enable inline expressions
        if (attr_value.type === "Value" && attr_value.token.type === "(string)") {
            var attr_context = new _plates.ParseContext(lexer.tokenize(attr_value.token.value));
            parser.consume(attr_context); // Set up initial token
            attr_value = parser.content(attr_context, '(newline)', true);
        }

        return new _plates.n.Attribute(left, attr_value);

    });

    this.templates = {};
    var elements = document.getElementsByClassName(classname);

    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        var name = element.getAttribute('data-name') || element.id;
        if (!name)
            throw "TemplateError: An element with the class name: '" + classname + "' has no 'data-name' (and no 'id') defined. Templates are rendered by name, so you need to name it with either of those attributes.";
        var tokenized = lexer.tokenize(element.innerHTML);
        this.templates[name] = parser.parse(tokenized);
    }

    this.render = function (name, variables, container) {
        var template = this.templates[name];
        if (!template)
            throw "TemplateError: No Template found by name: '" + name + "'";
        var scope = new _plates.Scope(variables);
        if (!container) {
            container = document.createElement('div');
            container.className = "_template_";
        }
        template.evaluate(scope, container);
        return container;
    };

};

