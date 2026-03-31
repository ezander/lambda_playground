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
* [x] Make interpreter also accept lambda or lambda as unicode
* [x] Make beta reductions via [], i.e. let application `(\x . e)a` first evaluate to `e[x:=a]` in an extra step, then perform beta
* [x] Maybe we need eta-reduction?
* [x] what about ; for multiline defs?
* [x] tool tips over buttons
* [x] recheck all tests and coverage
* [x] maybe also a download button, to get the text as plain text file
* [x] ability to save and retrieve under different names in local storage
* [x] improve examples and inserts, maybe complete remove examples. therefore inserts can be multiline, - church booleans, church numerals, std combinators, pairs, list

## For later or to consider

* [ ] again, improve examples (i will specify them, for bool, numbers, data structures)
* [ ] improve inserts (numerals, lists, natural recursion, etc)
* [ ] think about multi-evaluation and/or printing intermediate expressions
* [ ] make a settings box, e.g. for this evaluate thing, the number of steps, lines to display and so on, save to local storage if wanted
* [ ] Make limits (steps, display) settable (or smaller?)

* [ ] think about greek vars for identifiers (but exclude some with specific meaning like lambda)
* [ ] introduce typed lambda calculus
* [ ] maybe add symbols pi and tau, where (pi expr) reduces and print prints the expression and (tau expr) print the type of expr
* [ ] could think of more symbols like beta, and eta for reductions
* [ ] where do evaluation/print boxes then land (also with question mark: show ast? highlight? identify normalized?) 
* [ ] think also about identifiers with spaces and stuff defined by `Bla \phi \omega`, could also be used for printing
* [ ] hbr uses 'where' clauses. shall we? dunno
* [ ] should we have line continuation with e.g. \
* [ ] I think \pi shall evaluate the expression, print in a list, with two lines, original expr above, and reduced and normalized expr below
* [ ] \pi can appear inside exprs (what's then the result? the result itself? or I? or does it take two and returns the latter?)
* [ ] does the latter make sense? when it's in the expression all subst and redex have been applied already, so the source expr does not say much 
* [ ] when we show which subst is to be made (hygenically), shall we clean it somehow (like x -> x', or x -> x5)
* [ ] what about making the line numbers a bit smaller (and maybe then 4 digits, we'll never get over this)
* [ ] what about horizontal rulers, and boxes where the resulst will show up

## Not approved

* [ ] let's think whether we should use 0, 1, 2 per default for the church numerals
* [ ] make identified forms clickable, and go to line
* [ ] remove grammar and link from main page and just leave in help?
* [ ] think about using `:=` for definitions (like hbr)
* [ ] why still abs, app and only rename later??
* [~] Create grammar display from real grammar (?) — not worth it, update manually
* [~] test also the UI?
