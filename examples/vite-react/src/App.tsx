export function App() {
  return (
    <main>
      <h1>Vite + React 19</h1>
      <p>Hold Alt/Option and click the card or icon.</p>
      <ExampleCard />
    </main>
  )
}

function ExampleCard() {
  return (
    <article>
      <ExampleIcon />
      <strong>Open this component in your editor</strong>
    </article>
  )
}

function ExampleIcon() {
  return (
    <svg aria-label="Code" role="img" viewBox="0 0 24 24">
      <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
    </svg>
  )
}
