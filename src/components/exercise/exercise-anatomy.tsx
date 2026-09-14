import Image from "next/image";

type AnatomyMedia = { src?: string; alt: string };

function AnatomyCard({ title, tone, media, muscles }: { title: string; tone: "primary" | "secondary"; media: AnatomyMedia; muscles: readonly string[] }) {
  return <article className={`anatomyCard anatomyCard--${tone}`}>
    <h3>{title}</h3>
    {media.src ? <Image src={media.src} alt={media.alt} width={520} height={780} className="anatomyImage" /> : <p className="anatomyFallback">Le repérage est détaillé dans la liste ci-dessous.</p>}
    <ul>{muscles.map((muscle) => <li key={muscle}>{muscle}</li>)}</ul>
  </article>;
}

export function ExerciseAnatomy({
  primaryMuscles,
  secondaryMuscles,
  primaryMedia,
  secondaryMedia,
  status,
}: {
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  primaryMedia?: string;
  secondaryMedia?: string;
  status: "READY" | "REVIEW_REQUIRED";
}) {
  return <section className="exercisePanel anatomyPanel" aria-labelledby="exercise-anatomy-title">
    <div className="sectionHeading"><span>Anatomie</span><h2 id="exercise-anatomy-title">Muscles sollicités</h2></div>
    {status === "REVIEW_REQUIRED" ? <p className="anatomyStatus">Illustrations anatomiques en validation. Les libellés ci-dessous restent la référence de la fiche.</p> : null}
    <div className="anatomyGrid">
      <AnatomyCard title="Muscles principaux" tone="primary" media={{ src: primaryMedia, alt: "Vue postérieure anatomique avec le grand dorsal surligné en rouge." }} muscles={primaryMuscles} />
      <AnatomyCard title="Muscles secondaires" tone="secondary" media={{ src: secondaryMedia, alt: "Vue anatomique trois-quarts avec les muscles secondaires du tirage vertical surlignés en bleu." }} muscles={secondaryMuscles} />
    </div>
  </section>;
}
