import { useRef, useState } from 'react'
import Header from './components/Header.jsx'
import Hero from './components/Hero.jsx'
import SearchForm from './components/SearchForm.jsx'
import ResultsSection from './components/ResultsSection.jsx'
import Footer from './components/Footer.jsx'
import { searchFlights } from './lib/searchFlights.js'

export default function App() {
  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [results, setResults] = useState([])
  const [criteria, setCriteria] = useState(null)
  const [error, setError] = useState('')
  const [prefill, setPrefill] = useState(null)

  const formRef = useRef(null)
  // Guards against a slow earlier search resolving after a newer one.
  const requestId = useRef(0)

  async function runSearch(next) {
    const id = ++requestId.current
    setCriteria(next)
    setStatus('loading')
    setError('')

    try {
      const offers = await searchFlights(next)
      if (id !== requestId.current) return
      setResults(offers)
      setStatus('success')
    } catch (err) {
      if (id !== requestId.current) return
      setError(err?.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  function handlePickRoute(route) {
    setPrefill(route)
    formRef.current?.scrollIntoView({ block: 'center' })
  }

  return (
    <div id="top" className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <Hero />

        <div ref={formRef} className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <SearchForm
            onSearch={runSearch}
            busy={status === 'loading'}
            prefill={prefill}
          />
        </div>

        <ResultsSection
          status={status}
          results={results}
          criteria={criteria}
          error={error}
          onRetry={() => criteria && runSearch(criteria)}
          onPickRoute={handlePickRoute}
        />
      </main>

      <Footer />
    </div>
  )
}
