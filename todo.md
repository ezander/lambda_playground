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
* [x] Maybe a "load & run" button for directly loading and running the stuff ← yes; F5 load & run, F6 load only
* [x] In the textbox I want to be able to select text and when I hit '(' parenthesize/bracket the whole selected expression
* [x] Better examples or "clickable" definitions ← clickable defs in output panel
* [x] Better locate parser errors (clickable?) ← yes; click error jumps to line
* [x] For the "matching display": a) display all matching definitions, separated by comma b) reduce both completely to normal form such that `add one one` displays `two` then two is `succ succ zero`
* [x] also allow 0, 1, ... as identifiers, we don't have numbers anyway, so why not, mean identifier can be any combo of digits and letters and stuff
* [x] Shall we give a warning or error when there are redefinitions and normal forms differ? ← warning shown
* [x] Where is currently the insertion point? ← cursor pos shown in status bar
* [x] A clear button would be nice
* [x] shortcuts would also be nice (e.g. f5 for load and run, f10 for step, ...)
* [x] Add unittests
* [x] save to browser local storage (save, restore)
* [x] make help button more prominent (maybe) or put closer to textfield
* [x] put shortcuts directly on buttons? ← shortcuts shown in tooltips
* [x] use better textfield? ← yes; CodeMirror 6
* [x] maybe add a full screen or kino mode for the text field ← see kino entries below
* [x] make insertion point for definitions the current line, shift current line down, make also a symbol insertion for e.g. lambda, and mu which just inserts the unicode symbol at the current pos
* [x] Make alt-l insert unicode lambda (also alt-m for μ)
* [x] Make interpreter also accept lambda or lambda as unicode
* [x] Make beta reductions via [], i.e. let application `(\x . e)a` first evaluate to `e[x:=a]` in an extra step, then perform beta
* [x] Maybe we need eta-reduction? ← yes; η-step button for manual step; `#! allow-eta` to enable automatically
* [x] what about ; for multiline defs? ← yes; `;` is statement separator (same as newline)
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
* [x] think about using `:=` for definitions
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
* [x] In the editor: the line numbers should match the baseline of the text lines, not the top
* [x] Should we directly normalize definitions or make that optional ← normalize by default; #! no-normalize-defs / #! normalize-defs pragma; warns on step limit
* [x] fullscreen layout: editor 1/3 left, eval+output 2/3 right stacked; editor fills space with toolbar pinned at bottom
* [x] add more symbols and expansions, like forall, exists, equiv, and, or, not, implies, oplus, otimes, compose ← logic section in picker; ∀∃≡⊢ reserved (greyed); free ones valid as operator identifiers; \name[Space] expansion
* [x] limit the number of terms in an expansion to prevent mem overflow for "expanding" terms ← maxSize (AST node count); sizeLimit result; shown red/definitive; #! max-size pragma + settings
* [x] we need an equiv operator (3 bars), that can only go first in a line and is an equivalence assertion like "equiv term1 term2", needs to take exactly two terms, and passes, when both are alpha-beta-equivalent, and terminates reduction of the script if not ← ≡ token; uses maxStepsIdent; shown in output panel interleaved with π; green/red ≡ sign; halts further processing on failure
* [x] print somewhere how many steps the reduction took
* [x] we need multiline comments
* [x] shall we allow ' for identifiers, just to be able to do x'. is it worth it or not?
* [x] allow e.g. max-steps 10 instead of max-steps=10? or auto-insert? we have this simplified form for truth values
* [x] consider making an include system maybe also with comments, some standard stuff can be pulled in (boolean, list, numerals, or own stuff, maybe comment syntax #< boolean), maybe `#! include="Church Booleans"` or "sys/Booleans". pulls in only defs, leaves other stuff unevaluated, then each def should track where they come from ← `#! include "sys/..."` / `"user/..."` syntax; isolated; ≡ checked, π silenced; circular detection; errors annotated with source
* [x] shall alt-e and alt-p insert equiv and pi at the beginning of the line?
* [x] fix text overflow in output for long outputs e.g. non-converging, non-normalizing exprs ← truncate at 200 chars with expandable (more)/(less)
* [x] storing parsed/evaluated includes including errors (?) ← module-level cache keyed by path, content-compared on each lookup
* [x] if we're editing a "file" or not, we need to make that clearer (or if we do, always auto-save, store that also in storage, indicate when changes have happened) (scratchpad function) ← scratch buffer auto-saved, named buffers with ● dirty indicator, save/save-as/new/delete, buffer switcher in dropdown
* [x] export/import facility via zip-file of all user programs (selective import?) ← export all named buffers to zip, import with selective checkbox dialog, conflict highlighting
* [x] `π[a:={true,false}, b:={true,false}] and a b` — substitution comprehension for π: evaluate expr for each combination of values, print as flat list (useful for truth tables) ← also ≡[...] comprehension
* [x] are pragma effects reset after the include files ends? ← confirmed; includes run with isolated config, only defs cross boundary; tests added
* [x] bug: no error shown when equiv failed in include, needs to be bubbled up ← synthetic error pushed when included result has !ok with no real errors
* [x] kino mode is great, can we have it without fullscreen too? ← three modes: normal / theater (⛶, layout only) / fullscreen (Maximize, layout + browser fullscreen)
* [x] maybe add a draggable slider between editor and right panels in kino mode ← draggable divider with kinoSplitPct state, defaults to 33%
* [x] in the output: there should be no backticks when it's an operator symbol inside. Only for symbols like space, or what we usually don't allow as identifiers, i.e. only when what's inside backticks is not a plainIdent
* [x] move the errors in kino mode to the right pane (with panel or without? at least not collapsible)
* [x] syntax highlighting preserved for valid code before a parse error ← prefix re-parse up to last newline before first error
* [x] mixin pragma: like include but passes parent defs to the file ← `#! mixin "..."` caches on path+content+serialized defs
* [x] the save button dot: make it green when everything's okay, make it read when not ← dirty ● colors: green=ok, yellow=warning, red=error; also red on equiv assertion failure
* [x] output in multi-assert should not contain comma in subst ← chained `[a:=v][b:=w]` display instead of comma-separated
* [x] leave out the space, when inserting equiv via alt-e ← also alt-p; no trailing space
* [x] make backticks work on selection in editor like parens ← also auto-closes (inserts paired backticks) when no selection; removed <> wrap since < > are identifier chars
* [x] problem with scratch and examples and undo: select an example, fills your scratch buffer, but if you were in a diff buffer before, you can't undo and your prev scratch is lost ← old scratch set as undo base before loading example
* [x] links in comments e.g. with [example/Bla], make clickable, load example bla, or tut/bla into scratch, user links load buffers ← [type/name] in line+block comments; underlined accent color; asks if dirty
* [x] get rid of the inserts/snippets - we have includes, better: docs/tutorials/examples/maybe quizzes ← doc/example/tutorial namespaces as .txt files; toolbar dropdowns; [] link + #! include completion; doc/Welcome.txt as default scratch
* [x] make the current line somewhat more prominent in the editor ← activeLine opacity 0.03→0.09
* [x] expose eta-reduction via `#! allow-eta` pragma (etaStep already implemented in eval.ts) ← done; also threads through normalize/buildNormDefs/equiv/print

## Up next

* [x] shall we have a non-equiv, too? could be useful ← ≢ (Alt-N, \nequiv); passes when not equivalent; halts on failure; comprehension supported
* [ ] maybe ::= for redef or undef, for temp things
* [ ] I want to have a text rewrap with ctrl+r in multiline comments
* [ ] run reductions in a Web Worker so UI stays responsive and long/infinite reductions can be cancelled
* [ ] what happens in import when the current buffer is overwritten and/or in modified state (check)
* [ ] we reintroduced the bug with syntax highlighting of defs that are defs later in the file
  * [ ] what about undefining symbols, or marking as not for export, i.e. only local
* [ ] think about the state and future of the eval panel...
  * [ ] the expression thing is useful for evaluating and looking at singular expressions, the output for long lambda scripts, maybe we need a divide here?
  * [ ] or maybe a tabbed panel: eval for scratch, and output for named buffers, hmm...
  * [ ] or only output, and you can load the eval into a modal and to the step by step thing there?
* [ ] weird: all white when last char is only an equiv, but when there's an error before, highlighting works

## Consider

* [ ] output expressions: term highlighting (like in the editor), possibility for inline output (as "widgets" directly in the editor via codemirror plugins), manual reductions (just a thought)

* [ ] consider marking disallowed identifiers like lambda or beta in red... (could be in parser: mark first disallowed token read in red)
* [ ] Q: for identification: as long as at least one is an abstraction, apply new var to both sides? switched on/off via a flag
* [ ] make a literature tab in help
* [ ] in our current framework, can we make sure that a symbol is defined? 
* [ ] maybe have equiv[a] with a def for a, just make a new free variable in the expressions to come, without possiblity of being defined at outer scope
* [ ] what about evaluating expression when error occurred before

## For later

* [ ] remember when a term is copied, when it is then reduced apply the reduction to all copies, i.e. "referential term expansions" ? say (\ x . x x)((\y . a) b) -> ((\y . a)b) ((\y . a)b) -> a a (last in one steps because both terms are "the same")
* [ ] we need a syntax for annotating stuff, like which kind of reductions to use (none, alpha, beta, eta, by-value), or how many (+,\*,1,-), or precedence. we had this idea already, but need to make it clearer (idea: maybe epsilon means empty statement or no reduction, because it's also the empty word, idea: enclose reductions in {}), pi implies default reduction mode {\beta*} or (\beta*=} (wow this get's complicated, but can be quite neat, and clean)
  * [ ] explicit normalizations: e.g. `foo = \beta (\ x y . y) x`, could put beta also in exprs, could later add also \eta, or \eta*, \beta*, \alpha(M/x) or something and explicit reductions are carried out first  
  * [ ] maybe the \beta would be good to force immediate beta reduction on a term before the usual leftmost-outermost kicks in
* [ ] maybe also have an markdown like format with lambda expressions in between in ```lambda ``` blocks...
  * [ ] what about a markdown export?
* [ ] make identified forms clickable and go to line
* [ ] introduce typed lambda calculus (τ for type inf?)
* [ ] should we have line continuation with e.g. \ or next line starts with tab? maybe only when we have types lc, as lines get longer
* [ ] when we show which subst is to be made (hygienically), shall we clean it somehow (like x → x', or x → x5)

## Questionable
 
* [ ] ≢ renders smaller than ≡ in the editor — font fallback issue (U+2262 not in most monospace fonts)
* [ ] Shall we have editor tabs like an ide
* [ ] is pi a bit pointless? shall we print each expr to output if it's not the last? I mean, otherwise it has no effect at all, and if we don't want that, we could just comment it out...
* [ ] think about a leetcode-like layout of the ui (maybe only if I have a tutorial or when i'm at it...)
* [ ] with the leetcode-like layout, maybe introduce exercises (or have two tabs, one for normal programming, one for tuts with exercises)

## For me todo

* [x] think about how to specify longer examples or tutorials, no fun in ts file ← done; .txt files in includes/
* [ ] again, improve examples (I will specify them, for bool, numbers, data structures)
* [ ] make a small lisp demo
* [ ] make a demo with church numerals, and scott numerals
* [ ] make more demos and connect to a tutorial (basics, booleans, numerals, combinators)
* [ ] let's think whether we should use 0, 1, 2 per default for the church numerals
 
## Don't do

* [~] why still abs, app and only rename later??
* [~] *if* \pi can appear inside exprs (what's then the result? the result itself? or I? or does it take two and returns the latter?). does that make sense? when it's in the expression, all subst and redex have been applied already, so the source expr does not say much
* [~] hbr uses 'where' clauses. shall we? dunno
* [~] Create grammar display from real grammar (?) — not worth it, update manually
* [~] test also the UI?
