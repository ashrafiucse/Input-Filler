// Localized keyword bank for field-type detection.
//
// Each token is matched as a lowercase SUBSTRING of the normalized detection
// haystack (see detect.ts normalizeHaystack), in the same priority order as the
// English REGEX_RULES: for every rule, its localized equivalents are consulted
// right after the English pattern, so "Vorname", "Prénom" and "Nombre"
// classify exactly like "First Name".
//
// The list is deliberately curated rather than exhaustive:
//  - Only unambiguous, form-vocabulary words are included. Short tokens that
//    collide with common English substrings ("land", "via", "ort", "cap") are
//    excluded — a misdetected type is worse than a readable fallback sentence.
//  - Words already covered by an English token are omitted (e.g. "Telefon",
//    "teléfono", "telefone" all contain "tel"; "Adresse" contains "addr").
//  - Short tokens that collide across languages (bare "nome", which lives
//    inside "cognome"/"sobrenome", or the single CJK char "名", which lives
//    inside "ユーザー名") are excluded — a misdetected type is worse than a
//    readable fallback sentence. The longer, unambiguous forms cover those
//    languages instead ("cognome", "sobrenome", "名前").
//  - Accented spellings are kept as-is; normalizeHaystack ALSO folds
//    diacritics, so "Direccion" matches "Dirección" and "prenom" matches
//    "Prénom" either way. (Folding even lets the English bank match accented
//    cognates: "Téléphone" folds to "telephone", which contains "phone".)

export type I18nKeywords = Record<string, readonly string[]>;

export const I18N_KEYWORDS: I18nKeywords = {
  first_name: ['vorname', 'prénom', 'prenom', 'nombre', 'imię', 'imie', 'voornaam', 'имя', '名前'],
  last_name: ['nachname', 'familienname', 'apellido', 'sobrenome', 'cognome', 'nom de famille', 'фамилия', 'nazwisko', 'achternaam', 'nom', '姓', '苗字'],
  full_name: ['vollständiger name', 'vollstaendiger name', 'nom complet', 'nombre completo', 'nome completo', 'nombre y apellido', 'полное имя', '氏名', '姓名'],
  email: ['correo', 'courriel', 'почта', '邮箱', 'メール'],
  phone: ['móvil', 'movil', 'portable', 'mobil', 'handynummer', 'телефон', '手机', '電話', '电话', '電話番号'],
  zip: ['plz', 'postleitzahl', 'code postal', 'código postal', 'codigo postal', 'cep', 'kod pocztowy', 'почтовый индекс', 'индекс', '邮编', '郵便番号'],
  city: ['stadt', 'ville', 'ciudad', 'città', 'citta', 'cidade', 'miasto', 'город', '都市', '城市'],
  state: ['bundesland', 'provincia', 'região', 'regiao', 'estado', 'область', 'регион', '省'],
  country: ['pays', 'país', 'pais', 'paese', 'kraj', 'страна', '国家'],
  street: ['straße', 'strasse', 'rue', 'calle', 'rua', 'ulica', 'dirección', 'direccion', 'endereço', 'endereco', 'indirizzo', 'adres', 'улица', '住所', '地址'],
  company: ['firma', 'unternehmen', 'société', 'societe', 'entreprise', 'empresa', 'compañía', 'compania', 'azienda', 'bedrijf', 'компания', '会社', '公司'],
  job_title: ['poste', 'puesto', 'cargo', 'stanowisko', 'должность', '役職'],
  username: ['benutzername', 'utilisateur', 'usuario', 'usuário', 'gebruikersnaam', 'nazwa użytkownika', 'логин', 'ユーザー名', '用户名'],
  password: ['passwort', 'mot de passe', 'contraseña', 'contrasena', 'senha', 'wachtwoord', 'hasło', 'haslo', 'пароль', 'パスワード', '密码'],
  search: ['suche', 'suchen', 'rechercher', 'buscar', 'búsqueda', 'busqueda', 'pesquisar', 'zoeken', 'поиск', '検索', '搜索'],
  title: ['titel', 'titre', 'título', 'titulo', 'заголовок', 'タイトル', '标题'],
};
