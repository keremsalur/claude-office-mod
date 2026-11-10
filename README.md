# Piksel Ofis

Claude Code için bir mod: ajanların çalışmasını, sohbetin yanındaki panelde piksel art bir ofis olarak canlı gösterir. Ana ajan camlı odasında oturan taçlı liderdir; alt ajanlar kapıdan girer, masalarına geçer, işleri bitince çıkar.

## Kurulum

Claude Code terminal oturumunda, istem satırına:

```
/plugin install piksel-ofis --marketplace keremsalur/claude-office-mod
```

Kabuktan:

```
claude plugin install piksel-ofis --marketplace keremsalur/claude-office-mod
```

Masaüstü uygulamasında: istem kutusunun yanındaki + düğmesi, Plugins, Add marketplace alanına `keremsalur/claude-office-mod`, ardından Add plugin.

Claude Code 2.1.321 ya da daha yenisi gerekir.

## Token kuralı

Mod kullanılırken token harcamaz:

- Model çağırmaz, metin üretmez, özet çıkarmaz.
- Sohbete satır eklemez, istem göndermez, slash komutu kaydetmez.
- Kancaları her çağrıyı olduğu gibi iletir ve cevabı olduğu gibi döndürür.
- Kanca başına ek süre yaklaşık 0,04 ms'dir; çizimde bir hata olursa olay atılır, araç çağrısı etkilenmez.

## Ne gösterir

| Olay | Ofiste |
|---|---|
| Read, Grep, Glob | Kitaplıkta kitap okur; etikette dosya adı |
| Edit | Masada yazar, monitörde satırlar kayar |
| Write | Yazıcıdan kâğıt alır, yeşil "+", rafa yeni kitap |
| Bash içinde test komutu | Laboratuvar; yeşil tik ya da duman ve kırmızı çarpı |
| Diğer Bash komutları | Masada yeşil terminal ekranı |
| Web araması ve getirme | Pencerede dürbün ve dünya ikonu |
| Alt ajan başladı / bitti | Kapıdan giriş / çıkış |
| Ajanlar arası mesaj | Konuşma balonu |
| Kullanıcıya soru | El kaldırır, sarı "!" |
| İzin isteği | Turuncu kart |

Karakterler modele göredir: Opus (mor takım, gözlük), Fable (pelerin, taç bandı, yıldız), Sonnet (yeşil kapüşon, kulaklık), Haiku (kısa, sarı şapka), tanınmayan model (gri).

## Kullanım

- Panel oturum başında kendiliğinden açılır. Kapatırsan istem kutusunun üstündeki `▸ Piksel Ofis` düğmesi geri getirir.
- `Demo`: gerçek ajan çalışmadan tüm animasyonları oynatır (yaklaşık 58 sn).
- Karakter düğmeleri: bilgi kartı (model, görev, son 5 işlem, son dosyalar).
- `Günlük`: son 200 olay. `Büyüt`: yalnızca ofis.
- `Ayarlar`: animasyon hızı, balonlar, dosya etiketleri, hareketi azalt, ses efektleri (varsayılanda kapalı), tema.

## Dosyalar

- `hooks/register.tsx`: kancalar, panel, ayarlar.
- `hooks/sim.ts`: ofisin durumu; olaylardan yürüyüş ve iş planı çıkarır.
- `hooks/scene.ts`: durumu animasyonlu tek bir SVG olarak çizer.
- `hooks/art.ts`: tüm piksel art; hepsi kodla çizilir, dış görsel yoktur.
- `hooks/classify.ts`: hangi araç çağrısının hangi animasyon olduğu.
- `hooks/demo.ts`: demo betiği; testler de aynı betiği oynatır.
- `sounds/`: kodla üretilmiş beş kısa ses; `node sounds/make.mjs` yeniden üretir.
- `tests/`: `claude plugin test <bu klasör>` ile çalışır.

## Bilinen sınırlar

- Piksel görünümü masaüstü uygulamasında çizilir; terminalde panel yalnızca metin gösterir.
- Resmin içindeki tıklama moda iletilemez: ipucu kartı bir sonraki olayda kapanır. Kalıcı kart için karakter düğmeleri vardır.
- İzin kartı, onay verildikten sonra komut bitene kadar elde kalır: onay anını bildiren bir olay yoktur.
- Sesler yalnızca macOS'ta çalar.
