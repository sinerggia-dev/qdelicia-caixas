# -*- coding: utf-8 -*-
"""A TELA CARREGA? Abre as paginas de verdade num navegador e le o console.

POR QUE ISTO EXISTE
A suite de testes le o TEXTO dos arquivos. Ela e boa nisso — pega regra trocada,
nome divergente, medida errada —, mas nao executa nada. E `node --check` valida
a SINTAXE, que e outra coisa ainda.

Existe uma familia inteira de defeitos que passa pelos dois e derruba a tela:

  · chamada acima da declaracao de um `var` (o valor e `undefined`, e estoura);
  · funcao renomeada num lugar e chamada pelo nome velho em outro;
  · propriedade lida de um objeto que so existe depois do login;
  · erro em qualquer <script> do topo.

E o estrago e sempre o mesmo, e sempre grande: um erro no carregamento
INTERROMPE tudo o que vem depois dele no arquivo. Como a linha que decide entre
"abrir o app" e "pedir login" e a ULTIMA, qualquer erro antes dela deixa a tela
desenhada e morta. O botao Entrar aparece, e clicar nele nao faz nada.

Foi exatamente o que aconteceu: `aplicarOrdemFiltros()` escrita acima de
`var FILTROS_MOV = {...}`. Onze defeitos plantados e onze pegos no commit que a
introduziu, e o painel foi ao ar sem login.

O QUE ELA NAO PEGA, e e importante dizer: so o que roda no CARREGAMENTO. Sem
sessao, a tela para na porta — a tabela nao e desenhada, os cadastros nao sao
pedidos, e um erro que so acontece la dentro passa por aqui sem ser visto.
Medido: renomear `pintarTrava` e deixar as chamadas pelo nome velho NAO e pego,
porque nada chama essa funcao antes do login.

Ela cobre a familia que derruba a tela para TODO MUNDO, inclusive para quem
ainda nem entrou. E era essa que estava sem guarda nenhuma.

COMO USAR
    python scripts/carrega.py            as tres telas
    python scripts/carrega.py admin.html uma so

Sai com codigo 1 se qualquer pagina acusar erro — da para prender num gancho de
commit. Precisa do Chrome; sem ele, avisa e sai com 2, para nao passar por
aprovacao o que nao foi medido.
"""
import io, json, os, re, subprocess, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Os lugares de sempre do Chrome no Windows, mais a variavel de ambiente para quem
# o tiver noutro canto. Sem navegador nao ha medicao — e medicao que nao rodou nao
# pode virar "passou".
CANDIDATOS = [
    os.environ.get('CHROME'),
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
]
CHROME = next((c for c in CANDIDATOS if c and os.path.exists(c)), None)

PAGINAS = sys.argv[1:] or ['admin.html', 'index.html', 'extrato.html']

APANHA = u"""<script>
/* O apanhador entra ANTES de tudo: erro no primeiro <script> e o que mais importa,
   porque e o que derruba o arquivo inteiro. */
window.__erros = [];
window.addEventListener('error', function (e) {
  window.__erros.push({ msg: String(e.message), linha: e.lineno, col: e.colno,
                        arquivo: String(e.filename || '').split('/').pop() });
});
window.addEventListener('unhandledrejection', function (e) {
  window.__erros.push({ msg: 'promessa nao tratada: ' + String(e.reason) });
});
</script>
"""

FIM = u"""<script>
/* A espera nao e enfeite: a tela pede dados ao servidor no arranque, e a promessa
   rejeitada de uma consulta que falha tambem e um erro que se quer ver. */
setTimeout(function () {
  document.title = '@@' + JSON.stringify({
    erros: window.__erros,
    temQDC: !!window.QDC,
    /* A PROVA DE QUE O ARQUIVO CHEGOU AO FIM. Cada tela tem a sua: as duas do
       sistema montam a porta (login ou app); o EXTRATO nao tem login nenhum — ele e
       a pagina que o cliente abre pelo link —, e a prova dele e o conteudo ter
       saido do "Carregando". Exigir a porta ali acusaria um defeito que nao existe,
       e alarme falso e o jeito mais rapido de uma ferramenta destas ser ignorada. */
    temPorta: !!(document.getElementById('telaLogin') || document.getElementById('app')),
    respondeu: !!document.getElementById('conteudo')
  });
}, 900);
</script>
"""


def olhar(pagina):
    fonte = io.open(os.path.join(RAIZ, pagina), encoding='utf-8').read()
    i = fonte.index('</head>')
    pag = fonte[:i] + APANHA + fonte[i:]
    pag = pag.replace('</body>', FIM + '</body>')
    alvo = os.path.join(RAIZ, '_carrega_' + pagina)
    io.open(alvo, 'w', encoding='utf-8', newline='\n').write(pag)
    try:
        p = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-sandbox',
                            '--allow-file-access-from-files',
                            '--virtual-time-budget=5000',
                            '--window-size=1280,800', '--dump-dom',
                            'file:///' + alvo.replace('\\', '/')],
                           capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
    finally:
        try:
            os.remove(alvo)
        except OSError:
            pass
    m = re.search(r'<title>@@(\{.*?\})</title>', p.stdout, re.S)
    if not m:
        return {'erros': [{'msg': 'a pagina nem chegou a responder'}],
                'temQDC': False, 'temPorta': False, 'respondeu': False}
    return json.loads(m.group(1).replace('&quot;', '"').replace('&amp;', '&'))


if not CHROME:
    print('Chrome nao encontrado. Ponha o caminho em CHROME=... e rode de novo —')
    print('sem navegador nao ha medicao, e medicao que nao rodou nao vira "passou".')
    sys.exit(2)

ruim = 0
for pagina in PAGINAS:
    d = olhar(pagina)
    erros = d.get('erros') or []
    # O extrato nao tem porta: a prova dele e outra.
    montou = d.get('respondeu') if pagina == 'extrato.html' else d.get('temPorta')
    rotulo = ('o conteudo' if pagina == 'extrato.html' else 'a porta (login ou app)')
    falta = [k for k, v in (('o nucleo `QDC`', d.get('temQDC')),
                            (rotulo, montou)) if not v]
    if erros or falta:
        ruim += 1
        print('%-14s >>> NAO CARREGA' % pagina)
        for e in erros:
            print('    %s   (%s, linha %s)'
                  % (e.get('msg'), e.get('arquivo') or pagina, e.get('linha')))
        for f in falta:
            print('    faltou: %s' % f)
    else:
        print('%-14s carrega, sem erro' % pagina)

print()
print('%d de %d pagina(s) com problema' % (ruim, len(PAGINAS)))
sys.exit(1 if ruim else 0)
