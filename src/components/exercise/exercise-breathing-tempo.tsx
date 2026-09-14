export function ExerciseBreathingTempo({ breathing, tempo }: { breathing: string; tempo: { value: string; detail: readonly string[] } }) {
  return <section className="exercisePanel rhythmBreathing" aria-labelledby="rhythm-breathing-title">
    <div className="sectionHeading"><span>Rythme & respiration</span><h2 id="rhythm-breathing-title">Rythme & respiration</h2></div>
    <div className="rhythmBreathingGrid">
      <article className="rhythmBreathingCard"><h3>Tempo conseillé</h3><strong className="tempoValue">{tempo.value}</strong><ul>{tempo.detail.map((item) => <li key={item}>{item}</li>)}</ul></article>
      <article className="rhythmBreathingCard"><h3>Respiration</h3><p>{breathing}</p></article>
    </div>
  </section>;
}
