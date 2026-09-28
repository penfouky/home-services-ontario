#!/usr/bin/env python3
"""Rebrand the teddycloud_web translations to CrewCloud.

    python3 crewcloud-rebrand.py <teddycloud_web>/public/translations

Re-runnable and idempotent: when upstream updates its translation files, run this again.

What it does, per language file:
  1. Renames the product: "TeddyCloud"/"Teddycloud" -> "CrewCloud" in user-visible *values*
     (never keys). Lowercase "teddycloud" is left alone: it is used for files, hosts and paths.
  2. Keeps "TeddyCloud" where the text is about the upstream open-source project (its community,
     wiki, forum, changelog, contributors, sponsoring, support requests and releases). Renaming
     those would be misleading, and TeddyCloud is GPL-licensed, so credit stays visible.
  3. Renames the Teddy-branded features descriptively (TeddyAudio playlists -> playlists,
     TeddyStudio -> label studio) and rewords a few jargon-heavy strings in English.
  4. Adds the "crewcloud" block with the new strings used by the redesigned UI.

The output keeps the files' exact formatting (4-space JSON, key order, trailing newline).
"""
import json
import os
import re
import sys

# Keys whose values talk about the upstream TeddyCloud project: keep the name there.
UPSTREAM_KEY_PREFIXES = (
    "community.",  # the Community section: upstream forum, wiki, plugins, contributors, changelog
    "footer.sponsorText",  # "Like TeddyCloud?" next to the upstream sponsoring link
    "teddycloud.newVersion",  # upstream release notices
    "teddycloud.openNewVersionInGithub",
    "tonieboxes.esp32BoxFlashing.linkWikiGeneral",  # title of an upstream wiki article
    "home.forumIntroPart",  # "our forum" = the upstream forum
)

PRODUCT = re.compile(r"\bTeddy[Cc]loud\b")

STUDIO = {"en": "Label studio", "de": "Label-Studio", "fr": "Studio d'étiquettes", "es": "Estudio de etiquetas"}

# Per-language overrides for existing keys (dotted path -> new value).
OVERRIDES = {
    "en": {
        "tonies.encoder.navigationTitle": "Add audio",
        "tonies.encoder.title": "Add audio",
        "tonies.encoder.uploadText": "Tap to choose audio files, or drop them here (up to {{maxFiles}})",
        "tonies.encoder.uploadHint": "MP3, M4A, WAV, FLAC, OGG and more. We'll convert them for the box.",
        "tonies.encoder.uploadSuccessfulDetails": "Done! \"{{file}}\" is now in your library.",
        "tonies.tap.navigationTitle": "Playlists",
        "tonies.tap.title": "Playlists",
        "tonies.teddystudio.settingsSavedSuccessful": "Label studio settings saved",
        "home.yourTonieboxes": "Your boxes",
        # plugins are installed on this server (CrewCloud) but come from the TeddyCloud community
        "community.plugins.title": "Plugins",
        "community.plugins.intro": "Here you find the plugins you've added to CrewCloud. You can add new ones made by you or the TeddyCloud community!",
        "community.plugins.upload.uploadModalHint": "Upload a new or an existing plugin. If the zipped plugin already exists in CrewCloud, it will be overwritten.",
    },
    "de": {
        "tonies.encoder.navigationTitle": "Audio hinzufügen",
        "tonies.encoder.title": "Audio hinzufügen",
        "tonies.tap.navigationTitle": "Playlists",
        "tonies.tap.title": "Playlists",
        "home.yourTonieboxes": "Deine Boxen",
        "community.plugins.title": "Plugins",
        "community.plugins.intro": "Hier findest du die Plugins, die du CrewCloud hinzugefügt hast, und kannst neue Plugins von dir oder der TeddyCloud Community hinzufügen!",
        "community.plugins.upload.uploadModalHint": "Lade ein neues oder bestehendes Plugin hoch. Wenn das hochgeladene gezippte Plugin bereits in CrewCloud vorhanden ist, wird es überschrieben.",
    },
    "fr": {
        "tonies.encoder.navigationTitle": "Ajouter de l'audio",
        "tonies.encoder.title": "Ajouter de l'audio",
        "tonies.tap.navigationTitle": "Listes de lecture",
        "tonies.tap.title": "Listes de lecture",
        "home.yourTonieboxes": "Vos boîtes",
        "community.plugins.title": "Plugins",
        "community.plugins.intro": "Vous trouverez ici les plugins ajoutés à CrewCloud et pouvez en ajouter de nouveaux, fournis par vous-même ou par la communauté TeddyCloud !",
        "community.plugins.upload.uploadModalHint": "Téléversez un plugin nouveau ou existant. Si le plugin compressé existe déjà dans CrewCloud, il sera écrasé.",
    },
    "es": {
        "tonies.encoder.navigationTitle": "Añadir audio",
        "tonies.encoder.title": "Añadir audio",
        "tonies.tap.navigationTitle": "Listas de reproducción",
        "tonies.tap.title": "Listas de reproducción",
        "home.yourTonieboxes": "Tus cajas",
        "community.plugins.title": "Plugins",
        "community.plugins.intro": "Aquí puedes ver los plugins añadidos a CrewCloud y agregar nuevos plugins creados por ti o por la comunidad TeddyCloud.",
        "community.plugins.upload.uploadModalHint": "Sube un plugin nuevo o existente. Si el plugin comprimido ya existe en CrewCloud, será sobrescrito.",
    },
}

CREWCLOUD = {
    "en": {
        "nav": {
            "add": "Add audio", "boxes": "Boxes", "home": "Home", "label": "Main navigation", "more": "More",
            "notifications": "Notifications", "sectionPages": "Pages", "tonies": "Tonies",
        },
        "more": {
            "appearance": "Appearance", "boxSetup": "Box setup", "credit": "{{brand}} is built on {{upstream}}, open-source software.",
            "help": "Help & community", "language": "Language", "library": "Library", "player": "Audio player",
            "settings": "Settings", "setup": "Setup guide", "themeAuto": "Auto", "themeDark": "Dark", "themeLight": "Light",
        },
        "status": {"cloud": "Tonies cloud"},
        "encoder": {
            "add": "Add to library", "addMore": "Add more audio", "assignFailed": "Couldn't give the audio to that tonie",
            "assignedText": "Put {{tonie}} on the box to hear \"{{name}}\".", "assignedTitle": "All set!",
            "browserConvert": "Convert in this browser",
            "browserConvertHint": "Much smaller uploads. Turn off to send the raw audio to the server instead.",
            "converting": "Converting…", "doneText": "\"{{name}}\" is ready. Which tonie should play it?",
            "doneTitle": "Added to your library", "files_one": "{{count}} file", "files_other": "{{count}} files",
            "folder": "Save in", "giveTo": "Give it to {{tonie}}", "later": "Not now", "moreOptions": "More options",
            "name": "Name", "namePlaceholder": "e.g. Bedtime stories", "nowPlays": "Now: {{name}}",
            "noTonies": "No tonies yet. Put a tonie on your box once, then come back to give it this audio.",
            "orderHint": "drag to reorder", "pickTonie": "Choose a tonie", "sort": "Sort A–Z", "sortOptions": "Sort options",
            "uploading": "Uploading…",
        },
        "footer": {"sponsorUpstream": "Support {{upstream}}"},
        "setup": {
            "allowNewBox": "Let a new box register",
            "allowNewBoxHint": "Turn this on while you connect your box, then off again.",
            "assign": {"cta": "Choose a tonie", "text": "Right after adding audio you can pick the tonie that plays it. Or open a tonie and choose your audio as its source.", "title": "Give a tonie your audio"},
            "audio": {"text": "Upload stories, songs or recordings. {{brand}} converts them for the box.", "title": "Add your own audio"},
            "box": {"cta": "Open the box guide", "text": "Point your box at {{brand}} so it can fetch your audio. The guide walks you through it for your box model.", "title": "Connect your Toniebox"},
            "doneText": "Every step is done. Enjoy your tonies!",
            "doneTitle": "You're all set! 🎉",
            "normalize": "Even out the volume",
            "normalizeHint": "Quiet and loud recordings end up at a similar volume on the box.",
            "progress": "{{done}} of {{total}} steps done",
            "recommended": "Recommended settings",
            "saveFailed": "Couldn't save that setting",
            "saved": "Saved",
            "server": {"text": "Your server is up and this page can reach it.", "title": "{{brand}} is running"},
            "browserEncode": "Convert audio in the browser",
            "browserEncodeHint": "Uploads are many times smaller, which is quicker on mobile data.",
            "useRecommended": "Use recommended settings",
            "title": "Let's get {{brand}} ready",
            "tonie": {"cta": "See my tonies", "text": "Once your box is connected, every tonie you put on it shows up here.", "title": "Put a tonie on your box"},
        },
        "home": {
            "addText": "Songs, stories or your own recordings", "addTitle": "Add audio to a tonie",
            "connected": "{{count}} connected", "continueSetup": "Continue setup", "count": "{{count}} total",
            "finishSetup": "Finish setting up", "forum": "Community forum", "greeting": "Hi there! 👋", "help": "Need help?",
            "hideSetup": "Hide", "items_one": "{{count}} item", "items_other": "{{count}} items", "listenHere": "Listen here",
            "myTonies": "My tonies", "next": "Next",
            "noBoxesText": "Connect your Toniebox once and it will fetch your audio from {{brand}}.", "noBoxesTitle": "No box connected yet",
            "noToniesText": "Tonies appear here after you put them on a box that's connected to {{brand}}.", "noToniesTitle": "No tonies yet",
            "seeAll": "See all ({{count}})", "subtitle": "What would you like to do today?", "wiki": "{{upstream}} wiki",
        },
    },
    "de": {
        "nav": {
            "add": "Audio hinzufügen", "boxes": "Boxen", "home": "Start", "label": "Hauptnavigation", "more": "Mehr",
            "notifications": "Benachrichtigungen", "sectionPages": "Seiten", "tonies": "Tonies",
        },
        "more": {
            "appearance": "Darstellung", "boxSetup": "Box einrichten", "credit": "{{brand}} basiert auf {{upstream}}, freier Open-Source-Software.",
            "help": "Hilfe & Community", "language": "Sprache", "library": "Bibliothek", "player": "Audioplayer",
            "settings": "Einstellungen", "setup": "Einrichtung", "themeAuto": "Auto", "themeDark": "Dunkel", "themeLight": "Hell",
        },
        "status": {"cloud": "Tonies-Cloud"},
        "encoder": {
            "add": "Zur Bibliothek hinzufügen", "addMore": "Weitere Audios hinzufügen", "assignFailed": "Das Audio konnte dem Tonie nicht zugewiesen werden",
            "assignedText": "Stell {{tonie}} auf die Box, um „{{name}}“ zu hören.", "assignedTitle": "Fertig!",
            "browserConvert": "Im Browser umwandeln",
            "browserConvertHint": "Viel kleinere Uploads. Ausschalten, um das unbearbeitete Audio zum Umwandeln an den Server zu schicken.",
            "converting": "Wird umgewandelt …", "doneText": "„{{name}}“ ist bereit. Welcher Tonie soll es abspielen?",
            "doneTitle": "Zur Bibliothek hinzugefügt", "files_one": "{{count}} Datei", "files_other": "{{count}} Dateien",
            "folder": "Speichern in", "giveTo": "{{tonie}} zuweisen", "later": "Später", "moreOptions": "Weitere Optionen",
            "name": "Name", "namePlaceholder": "z. B. Gute-Nacht-Geschichten", "nowPlays": "Jetzt: {{name}}",
            "noTonies": "Noch keine Tonies. Stell einmal einen Tonie auf deine Box und komm dann zurück, um ihm dieses Audio zu geben.",
            "orderHint": "zum Umsortieren ziehen", "pickTonie": "Tonie auswählen", "sort": "A–Z sortieren", "sortOptions": "Sortieroptionen",
            "uploading": "Wird hochgeladen …",
        },
        "footer": {"sponsorUpstream": "{{upstream}} unterstützen"},
        "setup": {
            "allowNewBox": "Neue Box zulassen",
            "allowNewBoxHint": "Schalte das ein, während du deine Box verbindest, und danach wieder aus.",
            "assign": {"cta": "Tonie auswählen", "text": "Direkt nach dem Hinzufügen kannst du den Tonie wählen, der es abspielt. Oder öffne einen Tonie und wähle dein Audio als Quelle.", "title": "Einem Tonie dein Audio geben"},
            "audio": {"text": "Lade Geschichten, Lieder oder Aufnahmen hoch. {{brand}} wandelt sie für die Box um.", "title": "Eigene Audios hinzufügen"},
            "box": {"cta": "Box-Anleitung öffnen", "text": "Richte deine Box auf {{brand}} aus, damit sie deine Audios abrufen kann. Die Anleitung führt dich passend zu deinem Box-Modell durch.", "title": "Toniebox verbinden"},
            "doneText": "Alle Schritte erledigt. Viel Spaß mit deinen Tonies!",
            "doneTitle": "Alles bereit! 🎉",
            "normalize": "Lautstärke angleichen",
            "normalizeHint": "Leise und laute Aufnahmen klingen auf der Box ähnlich laut.",
            "progress": "{{done}} von {{total}} Schritten erledigt",
            "recommended": "Empfohlene Einstellungen",
            "saveFailed": "Einstellung konnte nicht gespeichert werden",
            "saved": "Gespeichert",
            "server": {"text": "Dein Server läuft und ist erreichbar.", "title": "{{brand}} läuft"},
            "browserEncode": "Audio im Browser umwandeln",
            "browserEncodeHint": "Uploads sind um ein Vielfaches kleiner und damit schneller über mobile Daten.",
            "useRecommended": "Empfohlene Einstellungen verwenden",
            "title": "Lass uns {{brand}} einrichten",
            "tonie": {"cta": "Meine Tonies", "text": "Sobald deine Box verbunden ist, erscheint hier jeder Tonie, den du darauf stellst.", "title": "Einen Tonie auf die Box stellen"},
        },
        "home": {
            "addText": "Lieder, Geschichten oder eigene Aufnahmen", "addTitle": "Audio zu einem Tonie hinzufügen",
            "connected": "{{count}} verbunden", "continueSetup": "Einrichtung fortsetzen", "count": "{{count}} insgesamt",
            "finishSetup": "Einrichtung abschließen", "forum": "Community-Forum", "greeting": "Hallo! 👋", "help": "Hilfe gebraucht?",
            "hideSetup": "Ausblenden", "items_one": "{{count}} Eintrag", "items_other": "{{count}} Einträge", "listenHere": "Hier anhören",
            "myTonies": "Meine Tonies", "next": "Als Nächstes",
            "noBoxesText": "Verbinde deine Toniebox einmal, dann holt sie deine Audios von {{brand}}.", "noBoxesTitle": "Noch keine Box verbunden",
            "noToniesText": "Tonies erscheinen hier, sobald du sie auf eine mit {{brand}} verbundene Box stellst.", "noToniesTitle": "Noch keine Tonies",
            "seeAll": "Alle anzeigen ({{count}})", "subtitle": "Was möchtest du heute machen?", "wiki": "{{upstream}}-Wiki",
        },
    },
    "fr": {
        "nav": {
            "add": "Ajouter", "boxes": "Boîtes", "home": "Accueil", "label": "Navigation principale", "more": "Plus",
            "notifications": "Notifications", "sectionPages": "Pages", "tonies": "Tonies",
        },
        "more": {
            "appearance": "Apparence", "boxSetup": "Configurer la boîte", "credit": "{{brand}} est basé sur {{upstream}}, un logiciel libre.",
            "help": "Aide et communauté", "language": "Langue", "library": "Bibliothèque", "player": "Lecteur audio",
            "settings": "Paramètres", "setup": "Guide d'installation", "themeAuto": "Auto", "themeDark": "Sombre", "themeLight": "Clair",
        },
        "status": {"cloud": "Cloud Tonies"},
        "encoder": {
            "add": "Ajouter à la bibliothèque", "addMore": "Ajouter d'autres audios", "assignFailed": "Impossible de donner l'audio à ce Tonie",
            "assignedText": "Posez {{tonie}} sur la boîte pour écouter « {{name}} ».", "assignedTitle": "C'est prêt !",
            "browserConvert": "Convertir dans ce navigateur",
            "browserConvertHint": "Des envois bien plus légers. Désactivez pour envoyer l'audio brut au serveur.",
            "converting": "Conversion…", "doneText": "« {{name}} » est prêt. Quel Tonie doit le jouer ?",
            "doneTitle": "Ajouté à votre bibliothèque", "files_one": "{{count}} fichier", "files_other": "{{count}} fichiers",
            "folder": "Enregistrer dans", "giveTo": "Donner à {{tonie}}", "later": "Plus tard", "moreOptions": "Plus d'options",
            "name": "Nom", "namePlaceholder": "ex. Histoires du soir", "nowPlays": "Actuellement : {{name}}",
            "noTonies": "Pas encore de Tonies. Posez une fois un Tonie sur votre boîte, puis revenez lui donner cet audio.",
            "orderHint": "glisser pour réordonner", "pickTonie": "Choisir un Tonie", "sort": "Trier A–Z", "sortOptions": "Options de tri",
            "uploading": "Envoi…",
        },
        "footer": {"sponsorUpstream": "Soutenir {{upstream}}"},
        "setup": {
            "allowNewBox": "Autoriser une nouvelle boîte",
            "allowNewBoxHint": "Activez-le pendant la connexion de votre boîte, puis désactivez-le.",
            "assign": {"cta": "Choisir un Tonie", "text": "Juste après l'ajout, vous pouvez choisir le Tonie qui le jouera. Ou ouvrez un Tonie et choisissez votre audio comme source.", "title": "Donnez votre audio à un Tonie"},
            "audio": {"text": "Importez des histoires, des chansons ou des enregistrements. {{brand}} les convertit pour la boîte.", "title": "Ajoutez vos propres audios"},
            "box": {"cta": "Ouvrir le guide", "text": "Configurez votre boîte pour qu'elle utilise {{brand}} et récupère vos audios. Le guide vous accompagne selon votre modèle.", "title": "Connectez votre Toniebox"},
            "doneText": "Toutes les étapes sont terminées. Profitez de vos Tonies !",
            "doneTitle": "Tout est prêt ! 🎉",
            "normalize": "Égaliser le volume",
            "normalizeHint": "Les enregistrements faibles et forts auront un volume similaire sur la boîte.",
            "progress": "{{done}} étape(s) sur {{total}} terminée(s)",
            "recommended": "Réglages recommandés",
            "saveFailed": "Impossible d'enregistrer ce réglage",
            "saved": "Enregistré",
            "server": {"text": "Votre serveur est en ligne et accessible.", "title": "{{brand}} fonctionne"},
            "browserEncode": "Convertir l'audio dans le navigateur",
            "browserEncodeHint": "Des envois bien plus légers, donc plus rapides en données mobiles.",
            "useRecommended": "Utiliser les réglages recommandés",
            "title": "Préparons {{brand}}",
            "tonie": {"cta": "Voir mes Tonies", "text": "Une fois la boîte connectée, chaque Tonie posé dessus apparaît ici.", "title": "Posez un Tonie sur la boîte"},
        },
        "home": {
            "addText": "Chansons, histoires ou vos enregistrements", "addTitle": "Ajouter de l'audio à un Tonie",
            "connected": "{{count}} connectée(s)", "continueSetup": "Continuer", "count": "{{count}} au total",
            "finishSetup": "Terminer la configuration", "forum": "Forum de la communauté", "greeting": "Bonjour ! 👋", "help": "Besoin d'aide ?",
            "hideSetup": "Masquer", "items_one": "{{count}} élément", "items_other": "{{count}} éléments", "listenHere": "Écouter ici",
            "myTonies": "Mes Tonies", "next": "Étape suivante",
            "noBoxesText": "Connectez votre Toniebox une fois et elle récupérera vos audios depuis {{brand}}.", "noBoxesTitle": "Aucune boîte connectée",
            "noToniesText": "Les Tonies apparaissent ici une fois posés sur une boîte connectée à {{brand}}.", "noToniesTitle": "Pas encore de Tonies",
            "seeAll": "Tout voir ({{count}})", "subtitle": "Que voulez-vous faire aujourd'hui ?", "wiki": "Wiki {{upstream}}",
        },
    },
    "es": {
        "nav": {
            "add": "Añadir", "boxes": "Cajas", "home": "Inicio", "label": "Navegación principal", "more": "Más",
            "notifications": "Notificaciones", "sectionPages": "Páginas", "tonies": "Tonies",
        },
        "more": {
            "appearance": "Apariencia", "boxSetup": "Configurar caja", "credit": "{{brand}} está basado en {{upstream}}, software de código abierto.",
            "help": "Ayuda y comunidad", "language": "Idioma", "library": "Biblioteca", "player": "Reproductor",
            "settings": "Ajustes", "setup": "Guía de configuración", "themeAuto": "Auto", "themeDark": "Oscuro", "themeLight": "Claro",
        },
        "status": {"cloud": "Nube de Tonies"},
        "encoder": {
            "add": "Añadir a la biblioteca", "addMore": "Añadir más audios", "assignFailed": "No se pudo dar el audio a ese Tonie",
            "assignedText": "Pon {{tonie}} en la caja para escuchar «{{name}}».", "assignedTitle": "¡Listo!",
            "browserConvert": "Convertir en este navegador",
            "browserConvertHint": "Subidas mucho más pequeñas. Desactívalo para enviar el audio sin convertir al servidor.",
            "converting": "Convirtiendo…", "doneText": "«{{name}}» está listo. ¿Qué Tonie debe reproducirlo?",
            "doneTitle": "Añadido a tu biblioteca", "files_one": "{{count}} archivo", "files_other": "{{count}} archivos",
            "folder": "Guardar en", "giveTo": "Dárselo a {{tonie}}", "later": "Ahora no", "moreOptions": "Más opciones",
            "name": "Nombre", "namePlaceholder": "p. ej. Cuentos para dormir", "nowPlays": "Ahora: {{name}}",
            "noTonies": "Aún no hay Tonies. Pon un Tonie en tu caja una vez y vuelve para darle este audio.",
            "orderHint": "arrastra para reordenar", "pickTonie": "Elegir un Tonie", "sort": "Ordenar A–Z", "sortOptions": "Opciones de orden",
            "uploading": "Subiendo…",
        },
        "footer": {"sponsorUpstream": "Apoyar {{upstream}}"},
        "setup": {
            "allowNewBox": "Permitir una caja nueva",
            "allowNewBoxHint": "Actívalo mientras conectas tu caja y luego desactívalo.",
            "assign": {"cta": "Elegir un Tonie", "text": "Justo después de añadir audio puedes elegir el Tonie que lo reproduce. O abre un Tonie y elige tu audio como fuente.", "title": "Dale tu audio a un Tonie"},
            "audio": {"text": "Sube cuentos, canciones o grabaciones. {{brand}} los convierte para la caja.", "title": "Añade tus propios audios"},
            "box": {"cta": "Abrir la guía", "text": "Configura tu caja para que use {{brand}} y descargue tus audios. La guía te acompaña según tu modelo.", "title": "Conecta tu Toniebox"},
            "doneText": "Todos los pasos están hechos. ¡Disfruta tus Tonies!",
            "doneTitle": "¡Todo listo! 🎉",
            "normalize": "Igualar el volumen",
            "normalizeHint": "Las grabaciones bajas y altas sonarán a un volumen parecido en la caja.",
            "progress": "{{done}} de {{total}} pasos hechos",
            "recommended": "Ajustes recomendados",
            "saveFailed": "No se pudo guardar el ajuste",
            "saved": "Guardado",
            "server": {"text": "Tu servidor está en línea y accesible.", "title": "{{brand}} está funcionando"},
            "browserEncode": "Convertir el audio en el navegador",
            "browserEncodeHint": "Subidas varias veces más pequeñas, más rápidas con datos móviles.",
            "useRecommended": "Usar los ajustes recomendados",
            "title": "Preparemos {{brand}}",
            "tonie": {"cta": "Ver mis Tonies", "text": "Cuando la caja esté conectada, cada Tonie que pongas aparecerá aquí.", "title": "Pon un Tonie en la caja"},
        },
        "home": {
            "addText": "Canciones, cuentos o tus grabaciones", "addTitle": "Añadir audio a un Tonie",
            "connected": "{{count}} conectada(s)", "continueSetup": "Continuar", "count": "{{count}} en total",
            "finishSetup": "Terminar la configuración", "forum": "Foro de la comunidad", "greeting": "¡Hola! 👋", "help": "¿Necesitas ayuda?",
            "hideSetup": "Ocultar", "items_one": "{{count}} elemento", "items_other": "{{count}} elementos", "listenHere": "Escuchar aquí",
            "myTonies": "Mis Tonies", "next": "Siguiente",
            "noBoxesText": "Conecta tu Toniebox una vez y descargará tus audios desde {{brand}}.", "noBoxesTitle": "Ninguna caja conectada",
            "noToniesText": "Los Tonies aparecen aquí cuando los pones en una caja conectada a {{brand}}.", "noToniesTitle": "Aún no hay Tonies",
            "seeAll": "Ver todo ({{count}})", "subtitle": "¿Qué quieres hacer hoy?", "wiki": "Wiki de {{upstream}}",
        },
    },
}


def sort_nested(d):
    """Sort keys recursively (the files keep every level alphabetical)."""
    return {k: sort_nested(v) if isinstance(v, dict) else v for k, v in sorted(d.items())}


def set_path(d, dotted, value):
    keys = dotted.split(".")
    for k in keys[:-1]:
        d = d[k]
    if keys[-1] not in d:
        raise KeyError(dotted)
    d[keys[-1]] = value


def rebrand_value(key, value, lang, stats):
    if not isinstance(value, str):
        return value
    new = value
    if not key.startswith(UPSTREAM_KEY_PREFIXES):
        new = PRODUCT.sub("CrewCloud", new)
    # descriptive names for the Teddy-branded features
    new = new.replace("TeddyStudio", STUDIO[lang])
    new = new.replace("TeddyAudio ", "").replace(" TeddyAudio", "")
    if new != value:
        stats["changed"] += 1
    return new


def walk(obj, path, lang, stats):
    if isinstance(obj, dict):
        return {k: walk(v, f"{path}.{k}" if path else k, lang, stats) for k, v in obj.items()}
    return rebrand_value(path, obj, lang, stats)


def main(folder):
    for lang in ("en", "de", "fr", "es"):
        path = os.path.join(folder, f"{lang}.json")
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        stats = {"changed": 0}
        data = walk(data, "", lang, stats)
        for dotted, value in OVERRIDES[lang].items():
            set_path(data, dotted, value)
        data["crewcloud"] = sort_nested(CREWCLOUD[lang])
        data = {k: data[k] for k in sorted(data)}  # keep top level alphabetical
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, indent=4, ensure_ascii=False) + "\n")

        # report what still says TeddyCloud (should only be upstream references)
        left = []

        def find(o, p):
            if isinstance(o, dict):
                for k, v in o.items():
                    find(v, f"{p}.{k}" if p else k)
            elif isinstance(o, str) and PRODUCT.search(o):
                left.append(p)

        find(data, "")
        print(f"{lang}: {stats['changed']} values rebranded; {len(left)} upstream references kept")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
