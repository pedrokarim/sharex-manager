# Signatures d'origine des images : détecter, afficher, retirer

Ce document décrit **ce qu'une image générée porte comme marques d'origine**,
comment les lire, comment les retirer sans perdre un pixel, et ce que le module
AI Image Gen devrait offrir autour de ça.

Il est écrit à partir d'un cas réel, survenu le 01/10/2026 : quatre images
sorties du module – `gen-1790773024865-TmSRjB-0.png` et trois autres – ont été
reprises pour un post public. Elles portaient toutes un manifeste complet qui
les déclarait produites par un modèle. Personne ne l'avait vu, parce que **rien
dans l'interface ne le montre**.

## 1. Ce qu'une image peut porter

### 1.1 Le manifeste C2PA

C2PA (*Coalition for Content Provenance and Authenticity*) est le format que
les grands générateurs écrivent aujourd'hui. Le manifeste est un conteneur
**JUMBF**, encodé en **CBOR**, signé par un certificat.

Où il se loge, selon le format du fichier :

| Format | Emplacement |
| --- | --- |
| PNG | un chunk de type **`caBX`** |
| JPEG | un segment **APP11**, préfixé `JP` |
| WebP | un chunk RIFF **`C2PA`** |
| AVIF / HEIF | une boîte `uuid` dédiée |
| MP4 / MOV | une boîte `uuid` au niveau racine |

Sur les quatre PNG du cas réel, le chunk `caBX` pesait **21 à 23 ko** et se
trouvait **juste après `IHDR`**, avant le premier `IDAT`.

Ce qu'on y lit d'utile, une fois le CBOR décodé :

| Champ | Ce qu'il dit | Valeur relevée dans le cas réel |
| --- | --- | --- |
| `claim_generator_info[].name` | l'outil qui a produit le fichier | `OpenAI Media Service API` |
| `claim_generator_info[].version` | sa version | – |
| assertion `c2pa.actions` → `digitalSourceType` | **la nature de l'image** | `trainedAlgorithmicMedia` |
| assertion `c2pa.actions` → `action` | ce qui a été fait | `c2pa.converted` |
| `when` | horodatage | `2026-…` |
| `c2pa.hash.data` | empreinte des octets couverts par la signature | – |

### 1.2 Le vocabulaire qui compte : `digitalSourceType`

C'est **le champ qui qualifie l'image**, et il vient du vocabulaire IPTC
(`cv.iptc.org/newscodes/digitalsourcetype/`). Les valeurs à connaître :

| Valeur | Signification |
| --- | --- |
| `trainedAlgorithmicMedia` | produite par un modèle entraîné – une image de génération |
| `compositeWithTrainedAlgorithmicMedia` | montage mêlant du généré et du réel |
| `algorithmicMedia` | produite par un algorithme non entraîné (rendu 3D, procédural) |
| `digitalCapture` | **vraie capture** : appareil photo, capture d'écran |
| `digitalArt` | œuvre numérique faite à la main |
| `minorHumanEdits` | capture retouchée à la marge |

Un seul de ces codes suffit à répondre à la question « est-ce une image de
modèle ? ». C'est lui qu'il faut remonter à l'écran, pas seulement le nom du
générateur.

### 1.3 Les autres traces, hors C2PA

Elles sont plus anciennes et plus bavardes. Beaucoup d'outils en laissent :

| Porteur | Où | Ce qu'on y trouve |
| --- | --- | --- |
| **XMP** | PNG `iTXt` (mot-clé `XML:com.adobe.xmp`), JPEG APP1, WebP `XMP ` | `photoshop:Credit`, `dc:creator`, `Iptc4xmpExt:DigitalSourceType`, `xmpMM:History` |
| **EXIF** | PNG `eXIf`, JPEG APP1 | `Software`, `Artist`, `ImageDescription`, `DateTimeOriginal` |
| **`tEXt` / `zTXt`** | PNG | le plus parlant de tous : Stable Diffusion et ComfyUI y écrivent le **prompt complet**, le modèle, le seed, le sampler, sous les clés `parameters`, `prompt`, `workflow`, `Comment` |
| **Nom de fichier** | – | `gen-<horodatage>-<id>-<index>.png` est déjà une signature de ce module |
| **Définition** | `IHDR` | une définition non standard (1672 × 941, 1024 × 1024) trahit souvent un générateur |

### 1.4 Ce qu'on ne sait pas détecter, et qu'il faut dire

**Les filigranes invisibles ne se lisent pas depuis le fichier.** SynthID
(Google) et les marquages équivalents sont inscrits **dans les pixels**, pas
dans les métadonnées. Les retirer n'est pas une opération de conteneur, et les
détecter demande l'outil du fournisseur.

Conséquence directe pour l'interface : le module ne doit **jamais** afficher
« aucune signature » comme une conclusion. Le libellé juste est **« aucune
signature trouvée dans le fichier »**, et la nuance doit être lisible.

De la même façon : retirer un manifeste change ce que le fichier **déclare**,
pas ce que l'image **est**. L'interface ne doit rien laisser croire d'autre.

## 2. Détecter – la méthode

### 2.1 Parcourir les chunks d'un PNG

Un PNG est une suite de chunks : `longueur` (4 octets, big-endian), `type`
(4 octets ASCII), `données`, `CRC` (4 octets). Il suffit de les parcourir sans
jamais décoder l'image.

```ts
type PngChunk = { type: string; length: number; offset: number };

/** Liste les chunks d'un PNG sans décoder un seul pixel. */
export function readPngChunks(file: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8; // on saute la signature PNG
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, length, offset });
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return chunks;
}
```

Un chunk `caBX` présent = manifeste C2PA. Les chunks `eXIf`, `iTXt`, `tEXt`,
`zTXt` portent le reste.

### 2.2 Lire le manifeste

Deux chemins, et le choix dépend de ce qu'on veut afficher :

1. **Bibliothèque dédiée** – `c2pa` (npm, WebAssembly) ou l'exécutable
   `c2patool`. C'est la seule voie qui **valide la signature** et dit si le
   certificat est de confiance. À préférer si l'affichage doit distinguer
   « signé et vérifié » de « signé mais invalide ».
2. **Lecture directe** – décoder le CBOR du JUMBF et aller chercher les
   quelques champs utiles. Suffisant pour afficher le nom du générateur et le
   `digitalSourceType`, sans dépendance lourde.

> Même sans décodeur CBOR, une recherche de sous-chaîne dans le chunk `caBX`
> trouve `trainedAlgorithmicMedia` et `OpenAI Media Service API` : les clés
> CBOR sont du texte en clair. C'est un dépannage honnête pour une première
> version, à condition de ne pas le présenter comme une validation.

### 2.3 Le piège à ne pas refaire

Chercher une chaîne dans **tout le fichier** donne des faux positifs : sur
trois des quatre images du cas réel, la suite d'octets `xmp` apparaissait
**à l'intérieur des `IDAT`**, donc dans les pixels compressés. Une coïncidence,
pas une métadonnée.

**La recherche doit être bornée au chunk concerné**, jamais faite sur le
fichier entier.

## 3. Retirer – sans perdre un pixel

### 3.1 Le principe

Les métadonnées vivent dans des chunks **séparés** des données d'image. On
réécrit donc le conteneur en recopiant les chunks à garder **octet pour
octet**, et en sautant les autres.

**Aucun passage par un encodeur.** Un aller-retour par `sharp`, par Canvas ou
par un outil d'image recompresse les pixels : c'est exactement ce qu'il faut
éviter quand l'image est destinée à être réutilisée en fond d'écran.

```ts
/** Chunks conservés : l'image et sa colorimétrie. Tout le reste est métadonnée. */
const KEPT_CHUNKS = new Set([
  "IHDR", "PLTE", "tRNS", "IDAT", "IEND",
  "sRGB", "gAMA", "cHRM", "pHYs", "bKGD",
]);

/** Réécrit le PNG sans ses métadonnées, sans toucher aux pixels. */
export function stripPngMetadata(file: Buffer): { output: Buffer; removed: string[] } {
  const kept: Buffer[] = [file.subarray(0, 8)];
  const removed: string[] = [];
  let offset = 8;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const chunk = file.subarray(offset, offset + 12 + length);
    if (KEPT_CHUNKS.has(type)) kept.push(chunk);
    else removed.push(type);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return { output: Buffer.concat(kept), removed };
}
```

Les CRC des chunks conservés restent valides : on ne modifie aucun chunk, on en
retire. Rien à recalculer.

Pour les autres formats, le principe ne change pas :

- **JPEG** : parcourir les segments et sauter `APP1` (EXIF, XMP) et `APP11`
  (JUMBF). Les données d'image (`SOS` et au-delà) sont recopiées telles quelles.
- **WebP** : conteneur RIFF, sauter les chunks `EXIF`, `XMP `, `C2PA`, et
  corriger la taille annoncée dans l'en-tête RIFF.

### 3.2 La vérification qui prouve qu'il n'y a pas eu de perte

Elle ne coûte presque rien et elle doit être systématique :

```ts
import sharp from "sharp";
import { createHash } from "node:crypto";

/** Vrai si les deux fichiers portent exactement les mêmes pixels. */
export async function samePixels(before: Buffer, after: Buffer): Promise<boolean> {
  const digest = async (file: Buffer) =>
    createHash("sha256").update(await sharp(file).raw().toBuffer()).digest("hex");
  return (await digest(before)) === (await digest(after));
}
```

Sur les quatre images du cas réel : hachage identique dans les quatre cas,
pour un gain de 21 à 23 ko par fichier. Les chunks restants se limitaient à
`IHDR`, les `IDAT` et `IEND`.

## 4. Ce qui est demandé au module AI Image Gen

### 4.1 Voir la signature, dans la section images

Dans la grille du studio et dans la visionneuse, chaque image porte un
**indicateur d'origine**. Trois états seulement :

| État | Quand | Libellé |
| --- | --- | --- |
| **Signée** | un manifeste est présent | le nom du générateur, par exemple « OpenAI Media Service API » |
| **Métadonnées** | pas de manifeste, mais EXIF, XMP ou `tEXt` | « métadonnées présentes » |
| **Rien trouvé** | aucun des deux | « aucune signature trouvée » – jamais « image propre » |

Un panneau de détail, au clic, montre **exactement ce qui a été lu**, sans
interprétation :

- le générateur et sa version ;
- le `digitalSourceType`, avec sa traduction en une ligne ;
- la date de la déclaration ;
- la liste des chunks ou segments porteurs, avec leur poids ;
- pour les `tEXt` de type `parameters` : le prompt, le modèle, le seed tels
  qu'ils sont écrits – c'est souvent là que se trouve le plus bavard ;
- l'état de la signature si une bibliothèque de validation est utilisée :
  vérifiée, invalide, ou non vérifiée.

### 4.2 Deux téléchargements, pas un

Le menu d'une image (`components/generation-menu.tsx`, aujourd'hui une seule
entrée appelant `downloadImage`) en propose deux :

| Entrée | Contenu | Nom proposé |
| --- | --- | --- |
| **Télécharger l'original** | le fichier tel que le générateur l'a produit, signature comprise | `gen-<id>-0.png` |
| **Télécharger une version propre** | le même fichier sans métadonnées, **pixels identiques** | `gen-<id>-0-clean.png` |

Règles qui vont avec :

- **L'original n'est jamais modifié sur le disque.** La version propre est
  produite à la volée, ou mise en cache à côté ; `data/images/` garde la
  source.
- **Aucune recompression**, dans aucun des deux cas. La version propre pèse
  quelques kilo-octets de moins, uniquement parce qu'elle a perdu des chunks.
- Le panneau de détail affiche le gain réel et **la confirmation que les
  pixels sont identiques**, calculée par la vérification du 3.2.
- Si le format n'est pas encore géré pour le retrait, l'entrée est désactivée
  avec la raison, plutôt que de produire un fichier recompressé.

### 4.3 Où ça se branche

| Élément | Fichier |
| --- | --- |
| Lecture et retrait | nouveau `modules/ai-image-gen/lib/provenance.ts` |
| Exposition au client | une fonction serveur dans `index.process.ts`, déclarée dans `module.json` |
| Indicateur sur la vignette | `components/generation-card.tsx` |
| Panneau de détail | `components/image-viewer.tsx` |
| Les deux entrées de téléchargement | `components/generation-menu.tsx`, `downloadImage` de `lib/client.ts` |
| Fichiers concernés | `modules/ai-image-gen/data/images/gen-*.png` |

La lecture se fait **côté serveur** : les fichiers y sont déjà, et le client
n'a pas à télécharger 2 Mo pour afficher un badge. Un appel groupé pour toute
une page de la grille évite une requête par vignette.

### 4.4 Critères d'acceptation

1. Une image portant un chunk `caBX` est signalée comme signée, et le panneau
   affiche le nom du générateur **et** le `digitalSourceType`.
2. Une image portant un `tEXt` `parameters` affiche le prompt et le modèle.
3. Une image sans aucune métadonnée affiche « aucune signature trouvée », et
   non « image propre ».
4. « Télécharger une version propre » produit un fichier dont le hachage des
   pixels bruts est **identique** à celui de l'original, vérifié par un test.
5. L'original sur le disque est inchangé après n'importe quel téléchargement –
   vérifié par hachage du fichier avant et après.
6. Un PNG, un JPEG et un WebP signés passent les cinq points ci-dessus.
7. Aucune recherche de chaîne n'est faite en dehors du chunk ou du segment
   concerné – un test avec une image dont les `IDAT` contiennent la suite
   `xmp` ne doit pas déclencher de faux positif.

## 5. Ce que ce travail ne fait pas

- Il **ne détecte pas** les filigranes inscrits dans les pixels (SynthID et
  équivalents). Une image peut être « sans signature trouvée » et rester
  entièrement traçable par son fournisseur.
- Il **ne rend pas** une image indétectable : les détecteurs statistiques
  travaillent sur les pixels, pas sur les métadonnées.
- Il **ne change pas la nature** de l'image. Retirer un manifeste retire une
  déclaration, et c'est tout ce que l'interface doit laisser entendre.
