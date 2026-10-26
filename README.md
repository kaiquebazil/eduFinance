# EduFinance

Este repositório contém o site estático publicado em GitHub Pages e o invólucro Expo para Android/iOS. O aplicativo Expo abre `https://kaiquebazil.github.io/eduFinance/` em uma WebView. Uma ponte no site espelha o `localStorage` para `AsyncStorage` no aparelho.

## Desenvolvimento

```sh
npm install
npm start
```

## Gerar APK no EAS

1. Crie ou acesse uma conta em [expo.dev](https://expo.dev).
2. Execute `npx eas-cli@latest login`.
3. Execute `npx eas-cli@latest build:configure` na primeira vez neste projeto.
4. Execute `npm run build:apk`.
5. Baixe o APK pelo link que o EAS exibir ao concluir.

O EAS compila na nuvem, então o Windows não precisa do Android Studio para esse fluxo. O APK abre o site publicado: publique também as alterações do site para ativar a ponte com AsyncStorage.

## Dados

O app nativo salva os dados do site em AsyncStorage e os restaura quando inicia. O armazenamento do navegador Chrome/Safari não é compartilhado com o app; exporte um backup no app atual e importe-o no APK se precisar migrar dados existentes.
