export function ExerciseExecution({ steps }: { steps: readonly string[] }) {
  return <section className="exercisePanel" aria-labelledby="exercise-execution-title"><div className="sectionHeading"><span>Mouvement</span><h2 id="exercise-execution-title">Exécution</h2></div><ol className="executionList">{steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></section>;
}
