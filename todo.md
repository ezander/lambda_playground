## Todos

* [x] For the pretty-printer, assert that when re-parsing the pretty-printed version it is the same as the original AST
* [x] Make everything after `#` a comment until the end of the line
* [x] Also allow `.` instead of `::=` having the same meaning.
* [x] When simplifying, add a box where each step is shown as history. Shall be cleared on load.
* [x] Definitions, e.g. `true ::= (\x y. x)` and later use `true x y` in formulas.
* [x] With the definitions, make line breaks important. I.e. new line means new formula.
* [x] Also allow for definitions `f x y ::= e` to mean `f ::= \x y := e`
* [x] Identification of certain normal forms (definitions) for display (replace vars, and compars asts)
* [x] Make the numbers in the history box line up with max. 4 digits
* [x] Add evaluation like `e[x:=a]` meaning something like `(\x . e)a`
* [x] Improve AST display (maybe with bars, better visualization what belongs to what, maybe expandable with triangles)
* [x] Longer descriptive names in the AST (Application instead of App)
* [x] Maybe a "load & run" button for directly loading and running the stuff
* [x] In the textbox i want to be able to select text and when i hit '(' parenthesize/bracket the whole selected expression
* [x] Better examples or "clickable" definitions
* [x] Better locate parser errors (clickable?)
* [x] For the "matching display": a) display all matching definitions, separated by comma b) reduce both completely to normal form such that `add one one` displays `two` then two is `succ succ zero`
* [x] also allow 0, 1, ... as identifiers, we don't have numbers anyway, so why not, mean identifier can be any combi of digits and letters and stuff
* [x] Shall we give a warning or error when there are redefinitions and normal forms differ?
* [x] Where is currently the insertion point?
* [x] A clear button would be nice
* [x] shortcuts would also be nice (e.g. f5 for load and run, f10 for step, ...)
* [x] Add unittests
* [x] save to browser local storage (save, restore)
* [x] make help button more prominent (maybe) or put closer to textfield
* [x] put shortcuts directly on buttons?
* [x] use better textfield?
* [x] maybe add a full screen or kino mode for the text field
* [x] make insertion point for definitions the current line, shift current line down, make also a symbol insertion for e.g. lambda, and mu which just inserts the unicode symbol at the current pos
* [x] Make alt-l insert unicode lambda (also alt-m for μ)

## For later or to consider


* [ ] maybe also a download button
* [ ] check church numerals, plus, and times
* [ ] Maybe we need eta-reduction?
* [ ] Make beta reductions via [], i.e. let application `(\x . e)a` first evaluate to `e[x:=a]` in an extra step, then perform beta
 
* [ ] Make interpreter also accept lambda or lambda as unicode

* [ ] test also the UI?
* [ ] ability to save and retrieve under different names in local storage 
* [ ] make a settings box, e.g. for this evaluate thing, the number of steps, lines to display and so on, save to local storage if wanted
* [ ] Make limits (steps, display) settable (or smaller?)
 
## Not approved

* [ ] let's think whether we should use 0, 1, 2 per default for the church numerals
* [ ] make identified forms clickable, and go to line
* [ ] remove grammar and link from main page and just leave in help?
* [ ] think about using `:=` for definitions (like hbr)
* [ ] why still abs, app and only rename later??
* [~] Create grammar display from real grammar (?) — not worth it, update manually
