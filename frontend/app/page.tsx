import SearchBar from '@/components/SearchBar';
import ResultsContainer from '@/components/results/ResultsContainer';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function HomePage() {
  return (
    <>
      <section className="bg-sky-100 w-full">
        <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-brand-black tracking-tight mb-3 [text-wrap:balance]">
            Plan your perfect trip
          </h1>
          <p className="text-base sm:text-lg text-brand-dark/80 mb-8 max-w-2xl mx-auto">
            Tell us where, when, and how much — we compare live prices across Booking.com, TripAdvisor &amp; Google.
          </p>
          <SearchBar />
        </div>
      </section>

      <ErrorBoundary label="ResultsContainer">
        <ResultsContainer />
      </ErrorBoundary>
    </>
  );
}
