* [x] For the pretty-printer, assert that when re-parsing the pretty-printed version it is the same as the original AST
* [x] Make everything after `#` a comment until the end of the line
* [ ] Also allow `.` instead of `::=` having the same meaning.
* [ ] When simplifying, add a box where each step is shown as history. Shall be cleared on load. 
* [ ] Definitions, e.g. `true ::= (\x y. x)` and later use `true x y` in formulas. 
* [ ] With the definitions, make line breaks important. I.e. new line means new formula.
* [ ] Also allow for definitions `f x y ::= e` to mean `f ::= \x y := e`
* [ ] Add unittests