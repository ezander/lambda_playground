export const examples: { label: string; src: string }[] = [
  {
    label: "booleans",
    src: `\
# Church booleans
true    := λx y. x
false   := λx y. y
not p   := p false true
and p q := p q false
or  p q := p true q
if  p t f := p t f

and (not false) true`,
  },
  {
    label: "numerals",
    src: `\
# Church numerals
zero      := λf x. x
succ  n f x := f (n f x)
plus  m n f x := m f (n f x)
mult  m n f   := m (n f)
one   := succ zero
two   := succ one
three := succ two
four  := succ three
five  := succ four

plus two three`,
  },
  {
    label: "pairs",
    src: `\
# Church pairs
pair  a b f := f a b
fst   p     := p (λa b. a)
snd   p     := p (λa b. b)

# Church booleans (needed by fst/snd)
true    := λx y. x
false   := λx y. y

snd (pair false true)`,
  },
  {
    label: "SKI",
    src: `\
# SKI combinators
I     := λx. x
K     := λx y. x
S f g x := f x (g x)

# S K K reduces to I
S K K z`,
  },
  {
    label: "Y combinator",
    src: `\
# Y combinator — diverges without a lazy argument
Y   := λf. (λx. f (x x)) (λx. f (x x))
I   := λx. x

# Y I diverges; step carefully
Y I`,
  },
];
