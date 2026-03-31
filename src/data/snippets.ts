export const snippets: { label: string; def: string }[] = [
  {
    label: "booleans",
    def: `\
true    = λx y. x
false   = λx y. y
not p   = p false true
and p q = p q false
or  p q = p true q
if  p t f = p t f`,
  },
  {
    label: "numerals",
    def: `\
zero      = λf x. x
succ  n f x = f (n f x)
plus  m n f x = m f (n f x)
mult  m n f   = m (n f)
one   = succ zero
two   = succ one
three = succ two
four  = succ three
five  = succ four`,
  },
  {
    label: "combinators",
    def: `\
I     = λx. x
K     = λx y. x
S f g x = f x (g x)
B f g x = f (g x)
C f x y = f y x`,
  },
  {
    label: "pairs",
    def: `\
pair  a b f = f a b
fst   p     = p (λa b. a)
snd   p     = p (λa b. b)`,
  },
  {
    label: "lists",
    def: `\
nil           = λc n. n
cons  h t c n = c h (t c n)
isnil l       = l (λh t. false) true
head  l       = l (λh t. h) false`,
  },
  {
    label: "Y",
    def: `Y = λf. (λx. f (x x)) (λx. f (x x))`,
  },
];
