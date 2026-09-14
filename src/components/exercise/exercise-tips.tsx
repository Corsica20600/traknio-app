export function ExerciseTips({ items }: { items: readonly string[] }) {
  return <section className="exercisePanel tipsPanel" aria-labelledby="exercise-tips-title"><div className="sectionHeading"><span>Technique</span><h2 id="exercise-tips-title">Conseils</h2></div><ul className="checkList">{items.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul></section>;
}
