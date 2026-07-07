import Hero from '@/components/home/Hero';
import HomeSections from '@/components/home/HomeSections';
import ResultsContainer from '@/components/results/ResultsContainer';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function HomePage() {
  return (
    <>
      <Hero />

      <ErrorBoundary label="ResultsContainer">
        <ResultsContainer />
      </ErrorBoundary>

      <HomeSections />
    </>
  );
}
