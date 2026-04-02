# Todos

## Done

* [x] For the pretty-printer, assert that when reparsing the pretty-printed version, it is the same as the original AST
* [x] Make everything after `#` a comment until the end of the line
* [x] Also allow `.` instead of `::=` having the same meaning.
* [x] When simplifying, add a box where each step is shown as history. Shall be cleared on load.
* [x] Definitions, e.g. `true ::= (\x y. x)` and later use `true x y` in formulas.
* [x] With the definitions, make line breaks important. I.e. new line means new formula.
* [x] Also allow for definitions `f x y ::= e` to mean `f ::= \x y := e`
* [x] Identification of certain normal forms (definitions) for display (replace vars, and compare asts)
* [x] Make the numbers in the history box line up with max. 4 digits
* [x] Add evaluation like `e[x:=a]` meaning something like `(\x . e)a`
* [x] Improve AST display (maybe with bars, better visualization what belongs to what, maybe expandable with triangles)
* [x] Longer descriptive names in the AST (Application instead of App)
* [x] Maybe a "load & run" button for directly loading and running the stuff
* [x] In the textbox I want to be able to select text and when I hit '(' parenthesize/bracket the whole selected expression
* [x] Better examples or "clickable" definitions
* [x] Better locate parser errors (clickable?)
* [x] For the "matching display": a) display all matching definitions, separated by comma b) reduce both completely to normal form such that `add one one` displays `two` then two is `succ succ zero`
* [x] also allow 0, 1, ... as identifiers, we don't have numbers anyway, so why not, mean identifier can be any combo of digits and letters and stuff
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
* [x] maybe also a download button to get the text as plain text file
* [x] ability to save and retrieve under different names in local storage
* [x] improve examples and inserts, maybe complete remove examples. therefore, inserts can be multiline, - church booleans, church numerals, std combinators, pairs, list
* [x] think about multi-evaluation and/or printing intermediate expressions π print statements
* [x] think about greek vars for identifiers (but exclude some with specific meaning like lambda) ← full Greek block; α/β/η reserved
* [x] think also about identifiers with spaces and stuff defined by `Bla \phi \omega`, could also be used for printing ← backtick-quoted identifiers
* [x] maybe add symbols pi and tau, where (pi expr) reduces and print prints the expression ← π done;
* [x] where do evaluation/print boxes then land ← π output panel above history
* [x] I think \pi shall evaluate the expression, print in a list, with two lines, original expr above, and reduced and normalized expr below
* [x] what about making the line numbers a bit smaller (and maybe then 4 digits, we'll never get over this)
* [x] display (did not terminate) instead of (step limit reached) in pi display
* [x] we need a better way of typing greeks (e.g. \alpha [tab], or alpha[alt-space], or alpha[ctrl-g] or something, some select symbol thing, or ctrl-g, combo-select alpha) or as html entity like &alpha; which is auto-replaced
* [x] symbol insert box?
* [x] allow + - * / as identifiers (and maybe ^ ~ & | for booleans) so we can write e.g. `+ m n = m S n` and `* m n = m (+ n) 0`
* [x] make all three displays (expr, reductions, output) have a name and be collapsible
* [x] what about horizontal rulers, and boxes where the result will show up?
* [x] Introduce options (pragma syntax?) `#pragma option(eta-conversion=true)`, `#pragma option(max-beta=10000)`, maybe better than settings box, or use `{max-beta=10000,}`
* [x] Make limits (steps, display) settable (or smaller?)
* [x] make a settings box (?), e.g. for this reduction thing, the number of steps, lines to display and so on, save to local storage if wanted
* [x] remove grammar and link from main page and just leave in help? maybe also remove hrb? diverged too much
* [x] max-steps seems to be one-off sometimes, you set it to n and get didnotterminate, then to n+1, and it says normal form, but it was normal form already with n
* [x] make alt-space select a) in expressions or defs from already defined defs, in pragmas from possible settings
* [x] maybe different max-step values for "run" and for "print" eval (and maybe also for "normalize check") ← max-steps-print, max-steps-run, max-steps-ident; max-steps pragma sets print+ident
* [x] separate max-history and visible-history and scroll when more than visible-history is stored ← history panel scrolls, default 200 entries

## Up next

* [ ] In the editor: the line numbers should match the baseline of the text lines, not the top

* [ ] Should we directly normalize definitions or make that optional (or prefix a def with a \beta? but it should be the default? only prefix def of Omega?)
* [ ] could think of more symbols like beta, and eta for reductions
* [ ] explicit normalizations: e.g. `foo = \beta (\ x y . y) x`, could put beta also in exprs, could later add also \eta, or \eta*, \beta*, \alpha(M/x) or something and explicit reductions are carried out first  
* [ ] is pi a bit pointless? shall we print each expr to output if it's not the last? I mean, otherwise it has no effect at all, and if we don't want that, we could just comment it out...

## Consider

* [ ] think about a leetcode-like layout of the ui
* [ ] again, improve examples (I will specify them, for bool, numbers, data structures)
* [ ] improve inserts (numerals, lists, natural recursion, etc.)
* [ ] examples and snippets are curr essentially the same, make snippets really useful (list gists), examples longer, with explanations, tutorials extra?
* [ ] think about how to specify longer examples or tutorials, no fun in ts file 
* [ ] make a small lisp demo
* [ ] make a demo with church numerals, and scott numerals
* [ ] make more demos and connect to a tutorial (basics, booleans, numerals, combinators)
* [ ] let's think whether we should use 0, 1, 2 per default for the church numerals
* [ ] think about a leetcode-like layout of the ui, maybe introduce exercises (or have two tabs, one for normal programming, one for tuts with exercises) 
* [ ] when we show which subst is to be made (hygienically), shall we clean it somehow (like x → x', or x → x5)
* [ ] (Q: for identification: as long as at least one is an abstraction, apply new var to both sides?)

## For later

* [ ] make identified forms clickable and go to line
* [ ] introduce typed lambda calculus (τ for type inf?)

## Questionable
 
* [ ] *if* \pi can appear inside exprs (what's then the result? the result itself? or I? or does it take two and returns the latter?). does that make sense? when it's in the expression, all subst and redex have been applied already, so the source expr does not say much
* [ ] should we have line continuation with e.g. \?
* [ ] hbr uses 'where' clauses. shall we? dunno
* [ ] why still abs, app and only rename later??
* [ ] think about using `:=` for definitions (like hbr)

## Don't do

* [~] Create grammar display from real grammar (?) — not worth it, update manually
* [~] test also the UI?
