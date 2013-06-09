
# Plates
### Logic-ful templating for JavaScript

---

### Overview

Plates is a templating library for JavaScript. It has no external dependencies, but is prepared to work alongside UnderscoreJS. 

The original motivation for writing this library was the apparent lack of JavaScript templating libraries based on an actual parser. The situation today is different, of course, but there's no harm in diversity and this was a good exercise for me personally.

**Note:** If you want to contribute to Plates, please let me know first. But if you just want to do your own thing, fork away!

### Design

Plates is designed to be straightforward, but flexible. Its syntax was inspired by Python and HAML. There are no plain HTML tags in a Plates template, but instead, HTML elements are constructed using the expressions `elem` and `elex`. The former can be used with a body, but the latter gets its content from the last expression on the same line ('elex' is short for 'element expression', for lack of a better term).

### Usage
You can use any HTML element as the container for a template - its contents get read with `element.innerHTML`, tokenized and then parsed. Templates are parsed only once, and then (re-)used as their object representations.

#### Initialization

    $(document).ready(function () {

        var plates = new Plates('template');
        var element = plates.render('todo_list', {get_items: get_list_items});

        $("#output").append(element);

    });
    
In this example, `template` is a class name that has been applied to all HTML elements that contain templates. Then, the variable `plates` will contain all of the templates found by that class name, and you can `render` them individually by their names (derived from a `data-name` on each original template element). In other words, elements that contain templates should have a class name for "discovering" them, and a `data-attribute` for naming them. The `render` method takes three parameters: 

 - The name of the template to be rendered 
 - A JavaScript object containing the parameters to be used for that template.
 - A DOM Element to render the template into *(optional)*

If no DOM Element is given, the template will be rendered into a newly created div element with `class="__template__"`. The `render` method returns whatever element the template was rendered into (either given, or created).

#### Syntax
As mentioned, Plates has a syntax that resembles Python and HAML. Here are the basic rules:

 - Every line that starts with an `@` (termed a 'syntax marker') is considered a statement (or expression, as the case may be). 
 - A `:` marks the beginning and an `end` the end of *any* body. 
 - Any line that does not start with the syntax marker is considered *content* for whatever body is being parsed. 

Content, like everything else, consists of tokens, though, and may contain "inline" expressions. If you want a variable printed out in the middle of a content line, add an `@` and whatever comes next will be parsed as an expression. There may also be additional content after an inline expression. 

Note that content tokens that are not part of inline expressions will just get printed out, separated by one space per token. But since `.` and `,` are tokens too, this means that punctuation gets separated from words, unless you use a *string literal* to keep them together. The following template contains some content with a string literal for this very purpose: `"TODO LIST, " @user`

#### Example: A TODO-list simplified

    <script type="text/template" class="template" data-name="todo_list">
        @elem h3:
            "TODO LIST, " @user
        @end
        @for item in get_items():
            @elem div class="item":
                @elem span:
                    @item.date
                @end
                @elem span:
                    @item.note
                @end
            @end
        @end
    </script>

Here we start with a `H3` element with some text content and an inline expression to print out a user's name, and proceed to loop over a list of items returned from a call to the `get_items` function. The for-loop has an explicit body, as marked by `:`. It contains a `div` element, introduced with the `elem` keyword. 

The`div` element is given a class name with an inline attribute, followed by another `:` to mark the beginning of its body. Inside the `div`, we find two `span` elements, each with its own body to print out information about a TODO-item.

There's an obvious optimization to be made here. Since each `span` is only meant to contain one value, giving them a full body seems like a waste. Luckily, because `item.date` is an expression by itself, we can give it to an `elex` to avoid needless typing:


    <script type="text/template" class="template" data-name="todo_list">
        @elem h3:
            "TODO LIST, " @user
        @end
        @for item in get_items():
            @elem div class="item":
                @elex span item.date
                @elex span item.note
            @end
        @end
    </script>
    
That's much better. We've eliminated two `end` markers, but both `span` elements are still resting comfortably inside that `div`. But let's not stop there. Eliminate *all the end markers!*


    <script type="text/template" class="template" data-name="todo_list">
        @elem h3:
            "TODO LIST, " @user
        @end
        @for item in get_items() elem div class="item":
            @elex span item.date
            @elex span item.note
    </script>

In this version, we've decided to omit the `end` markers for the loop and div. This is alright, because all bodies are parsed as "blocks", and everything that has a body is parsed either in the context of its parent's body, or the template's top-level block. When there are no more tokens left for a block (or the template), parsing it just comes to an end, even without an `end` marker. This means you can get away with much less typing, but you can also add `end` markers when necessary, or for additional clarity.

In this case, we *did* give the header element an end marker though, because otherwise everything produced by the for-loop would have ended up inside of it.

The `for` loop is given an implicit body in the form of an `elem` expression, but *that* does get an explicit body because we want it to contain two `span` elements, just like before. This is not the *only* way to accomplish this - we could experiment with tacking on an `elex` in an `elem`'s introduction, combined with a single-element body, but your mileage may vary. It's probably better to avoid somewhat unpredictable trickery, and to just spell things out in a neat and consistent manner.

It turns out that there's still a way to streamline this further though:

    <script type="text/template" class="template" data-name="todo_list">
        @elex h3 "TODO LIST, " + user
        @for item in get_items() elem div class="item":
            @elex span item.date
            @elex span item.note
    </script>

Our Quest to eliminate `end` markers comes to a *glorious* end! This time, we've replaced the header `elem` with an `elex` because we can "rephrase" the *content* `"TODO LIST, " @user` as a binary expression: `"TODO LIST, " + user` and use that as a body for the `elex`


### Features

Here's a preliminary list of Plates' features, in no particular order.

#### Conditionals

  - Plain if-statements:

        @for item in get_items():
            @if item.done:
                @elex div "Good job!"
            @else:
                @elex div "Get to work!"
            @end
        @end

#### Tertiary expressions:

  - A JavaScript -like tertiary expression:

        @for item in get_items():
            @elex div item.done ? "Good job!" : "Get to work!"
        @end

  - Leave out the "else clause" if you only want to output the "true" value:

        @for item in get_items():
            @elex div item.done ? "Good job!"
        @end
        
    (This left all other `div` elements empty)

#### Loops

  - Loop over arrays. While we're at it, note that we have array- and object literals too.

        @for number in [1, 2, 3, 4, 5]:
            @number
        @end
    
  - Loop over objects:

        @for key, value in {key1: 'value1', key2: 'value2'}:
            @elex div key
            @elex div value
        @end

#### Special loop features

  - You can use `loop.cycle` to cycle through values

        @for number in [1, 2, 3, 4, 5]:
            @elex div class=loop.cycle('odd', 'even') number
        @end
        
        @for number in [1, 2, 3, 4, 5]:
            @elex div class=loop.cycle('A', 'B', 'C') number
        @end
        
  - Loop state: `index` `first` `last` `odd` `even` `total` 

        @for number in [1, 2, 3, 4, 5]:
            Total items: @loop.total
            @elem div style="margin-left: 1em;":
                @if loop.first:
                    @elex div "First! " + loop.index
                @else if loop.last:
                    @elex div "Last! " + loop.index
                @else:
                    @elex div "Between!"
            @end
        @end


#### Filters

You can define custom filters for values, and then call them in templates. A filter is a plain JavaScript function that takes a value as its only parameter, and returns something based on it.

The `Plates` constructor takes a `settings` object as its second parameter, which can contain a member called `filters`. Naturally, that's where you place your custom filters:

        var status_filter = function (done) {
            if (done)
                return "Good job!";
            else
                return "Get to work!";
        };

        var plates = new Plates('template', {filters: {status: status_filter}});

Then you can call your filter by name like this:

    @for item in get_items():
        @elex div item.done | status
    @end

Filters can also be chained:

    @for item in get_items():
        @elex div item.done | status | other | stuff | you | have | defined
    @end

#### "Yo Dawg.."

You can use the `render` keyword to render templates from templates. At this time, other templates are rendered in the same scope, which is why we spell out `item.date` instead of plain `date`. Later on, you'll be able to *optionally* give the rendered template an object with the values to be used.

    <script type="text/template" class="template" data-name="todo_list">
        @for item in get_items() render list_item
    </script>

    <script type="text/template" class="template" data-name="list_item">
        @elem div class="item":
            @elex span item.date
            @elex span item.note
    </script>


.. More documentation to follow.













