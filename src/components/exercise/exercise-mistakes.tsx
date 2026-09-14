export function ExerciseMistakes({ items }: { items: readonly string[] }) {
  return <section className="exercisePanel mistakesPanel" aria-labelledby="exercise-mistakes-title"><div className="sectionHeading"><span>Sécurité</span><h2 id="exercise-mistakes-title">Erreurs fréquentes</h2></div><ul className="checkList">{items.map((item) => <li key={item}><span aria-hidden="true">×</span>{item}</li>)}</ul></section>;
}
