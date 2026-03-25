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
* [ ] Better examples or "clickable" definitions
* [x] Better locate parser errors (clickable?)

## For later
* [ ] Make limits (steps, display) settable
* [ ] Add unittests
* [~] Create grammar display from real grammar (?) — not worth it, update manually
