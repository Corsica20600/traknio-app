export function ExerciseWhy({ children }: { children: string }) {
  return <section className="exercisePanel exerciseWhy" aria-labelledby="exercise-why-title"><div className="sectionHeading"><span>Objectif</span><h2 id="exercise-why-title">Pourquoi cet exercice ?</h2></div><p>{children}</p></section>;
}
