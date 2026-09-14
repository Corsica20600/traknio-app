# Fiches techniques Traknio — Golden Reference

## Statut verrouillé

```text
LAT_PULLDOWN_TEMPLATE_STATUS = READY
DESIGN_LOCKED = TRUE
COLOR_SYSTEM_LOCKED = TRUE
GOLDEN_REFERENCE = TRUE
```

La source de vérité visuelle est la fiche déployée :
<https://www.traknio.com/exercises/lat-pulldown-machine>

Cette référence définit le système des futures fiches techniques. Elle ne
constitue pas une autorisation de modifier le catalogue ni de créer une autre
fiche sans validation explicite.

## Tokens de couleur

| Rôle | Token | Valeur verrouillée | Usage |
| --- | --- | --- | --- |
| Arrière-plan principal | `--technical-sheet-background` | `#020611` | Page et zone extérieure des fiches |
| Surface de carte | `--technical-sheet-surface` | `#091123` | Cartes, panneaux et zones de contenu |
| Surface élevée | `--technical-sheet-surface-raised` | `rgba(12, 23, 48, .94)` | Onglets et contrôles non actifs |
| Média | `--technical-sheet-media-surface` | `#081126` | Conteneur image/vidéo |
| Texte principal | `--technical-sheet-ink` | `#F8FBFF` | Titres et texte à fort contraste |
| Texte secondaire | `--technical-sheet-muted` | `#9EABC2` | Labels et texte secondaire |
| Contour | `--technical-sheet-line` | `rgba(138, 174, 255, .16)` | Bordures de cartes et séparateurs |
| Contour badge | `--technical-sheet-badge-line` | `rgba(138, 174, 255, .30)` | Badges non actifs |
| Accent principal | `--technical-sheet-accent` | `#00DCFF` | États actifs, badges principaux, labels, validations |
| Violet Traknio | `--technical-sheet-violet` | `#7A3CFF` | Dégradés d’ambiance uniquement |
| Bleu Traknio | `--technical-sheet-blue` | `#1E58FF` | Dégradés d’ambiance uniquement |
| Erreur / anatomie principale | `--technical-sheet-danger` | `#F05050` | Erreurs fréquentes et muscle principal |
| Anatomie secondaire | `--technical-sheet-anatomy-secondary` | `#3978FF` | Muscles secondaires uniquement |

Les cartes du Lat Pulldown utilisent actuellement une variante composée
`rgba(9, 17, 35, .90)` au-dessus du fond dégradé : elle appartient au rendu
verrouillé et ne doit pas être remplacée par l’ancienne palette anthracite.

## Règles d’emploi

- L’ancienne palette gris/vert ne doit plus servir de référence.
- Le cyan est l’accent d’action unique ; il ne doit pas recouvrir les surfaces.
- Le rouge est réservé aux erreurs et à l’anatomie primaire.
- Le bleu anatomique est réservé aux muscles secondaires.
- Les dégradés combinent uniquement le bleu et le violet Traknio existants,
  avec une opacité faible : ils créent la profondeur sans nuire à la lecture.
- Les contours restent subtils et bleutés ; aucune bordure blanche ou verte
  dominante ne doit être introduite.

## Contrat de composants

Les futures fiches devront réutiliser la hiérarchie validée :

1. en-tête applicatif natif Traknio, sous la zone système Android ;
2. identité de la fiche, badges et titre ;
3. cartes de contenu avec rayon `17–20px` ;
4. boutons/onglets de hauteur tactile minimale `42px` ;
5. média sans recadrage destructif, dans sa surface dédiée ;
6. anatomie textuelle accessible en complément des visuels ;
7. responsive mobile-first, sans débordement horizontal.

Les polices restent celles déjà chargées par Traknio : Raleway pour les titres,
Exo 2 pour le corps et les boutons, Orbitron uniquement pour le branding et les
labels existants.

## Garde-fous

- Ne pas modifier `Lat Pulldown Machine` sans correction de bug validée.
- Ne pas appliquer ce système à un autre exercice avant validation dédiée.
- Ne pas modifier les données, médias, billing ou le catalogue dans le cadre
  d’une évolution du design system.
