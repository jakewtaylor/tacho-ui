# EU tachograph legislation — local mirror

The grep-friendly `.txt` files in this directory are the offline sources the [parser migration plan](../parser-migration-plan.md) cites by §-section. They are HTML stripped to plain text with paragraph breaks preserved so `grep -n` returns useful line numbers.

| File | Regulation | Notes |
|---|---|---|
| `2016-799.txt` | Commission Implementing Regulation (EU) 2016/799 | Annex IC: data dictionary (App. 1), card structure (App. 2), download protocol (App. 7), security (App. 11). The primary source. |
| `2021-1228.txt` | Commission Implementing Regulation (EU) 2021/1228 | Amendments to 2016/799 introducing Gen2 *version 2* tachographs — new EFs for border crossings, load/unload operations, GNSS authentication status, etc. |
| `2002-1360.txt` | Commission Regulation (EC) 1360/2002 | Predecessor regulation (Annex IB) defining Gen1 digital tachograph cards. Cross-reference for byte layouts that 2016/799 inherits. |

The corresponding `.html` files and `*_files/` asset directories are gitignored — too large to track in-repo. To refresh:

1. Open the regulation on EUR-Lex:
   - 2016/799: <https://eur-lex.europa.eu/eli/reg_impl/2016/799/oj>
   - 2021/1228: <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32021R1228>
   - 2002/1360: <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32002R1360>
2. Save full page (with assets) as `<year>-<number>.html` into this directory.
3. Run the strip script (inline, since it's tiny):

   ```bash
   python3 -c "
   import re, html, sys
   for src in sys.argv[1:]:
       with open(src) as f: raw = f.read()
       raw = re.sub(r'</(p|div|td|tr|h[1-6]|table|li)>', r'</\1>\n', raw, flags=re.I)
       text = re.sub(r'<[^>]+>', ' ', raw)
       text = html.unescape(text)
       text = re.sub(r'[ \t]+', ' ', text)
       text = re.sub(r' *\n *', '\n', text)
       text = re.sub(r'\n{2,}', '\n', text)
       with open(src.replace('.html','.txt'), 'w') as f: f.write(text)
   " *.html
   ```

Citations in the migration plan use the form `App. 1 §2.117` (Appendix 1, section 2.117 of 2016/799 Annex IC) and `2021/1228 §TCS_155 n8` (paragraph TCS_155, row n8 of the amendments). Line numbers in these `.txt` files are stable as long as you don't re-run the strip with different regex.
