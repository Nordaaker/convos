#!perl
use lib '.';
use Convos::Util 'short_checksum';
use t::Helper;

$ENV{CONVOS_BACKEND} = 'Convos::Core::Backend::File';
my $t    = t::Helper->t;
my $user = $t->app->core->user({email => 'superman@example.com'})->set_password('s3cret');
$user->save_p->$wait_success('save_p');

my $asset = Mojo::Asset::File->new({path => __FILE__});
$t->post_ok('/api/file', form => {file => {file => $asset}})->status_is(401);

$t->post_ok('/api/user/login', json => {email => 'superman@example.com', password => 's3cret'})
  ->status_is(200);

note 'upload';
$t->post_ok('/api/file')->status_is(400)->json_is('/errors/0/path', '/file');

my $fid_re = qr/\w{16}/;
$t->post_ok('/api/file', form => {file => {file => $asset}})->status_is(200)
  ->json_is('/files/0/ext', 't')->json_is('/files/0/filename', 'web-files.t')
  ->json_is('/files/0/uid', 1)->json_like('/files/0/id', qr{^$fid_re$})
  ->json_like('/files/0/saved', qr{^\d+-\d+})
  ->json_like('/files/0/url',   qr{^http.*/file/1/$fid_re$});

my $fid = $t->tx->res->json('/files/0/id');
$t->get_ok("/file/1/$fid")->status_is(200)->text_is('header h1', 'web-files.t')
  ->text_like('header small', qr{^\d+-\d+-\d+})->content_like(qr{\<pre\>.*use t::Helper}s);
$t->get_ok("/file/1/$fid.t")->status_is(200)->content_like(qr{use t::Helper}s)
  ->content_unlike(qr{\<pre\>.*use t::Helper}s);

$t->get_ok("/api/file/1/1000000000000000")->status_is(404);
$t->get_ok("/file/1/1000000000000000")->status_is(404);

note 'set up connection';
my $connection = $user->connection({name => 'localhost', protocol => 'irc'});
t::Helper->irc_server_connect($connection);
t::Helper->irc_server_messages(qr{NICK} => ['welcome.irc'], $connection, '_irc_event_rpl_welcome');

note 'handle_multiline_message_p';
my %send = (connection_id => $connection->id, dialog_id => 'superwoman', method => 'send');
$send{message} = 'x' x (512 * 3);
$t->websocket_ok('/events')->send_ok({json => \%send})
  ->message_ok->json_message_is('/dialog_id', 'superwoman')->json_message_is('/event', 'message')
  ->json_message_like('/message', qr{^http.*/file/1/$fid_re})->finish_ok;

my $msg = Mojo::JSON::decode_json($t->message->[1]);
my $url = Mojo::URL->new($msg->{message});
$t->get_ok($url->path->to_string)->status_is(200)->text_is('header h1', 'paste.txt')
  ->text_like('header small', qr{^\d+-\d+-\d+})->content_like(qr{\<pre\>xxxxxxxx}s);

note 'back compat paste route';
my $paste = $user->core->home->child(qw(superman@example.com upload 149545306873033))
  ->spurt(Mojo::Loader::data_section('main', '149545306873033'));
my $user_sha1 = substr Mojo::Util::sha1_sum('superman@example.com'), 0, 20;

ok -e $paste, 'legacy paste exists';
$t->get_ok("/paste/10000000000000000000/149545306873033")->status_is(404);
$t->get_ok("/paste/$user_sha1/100000000000000")->status_is(404);
$t->get_ok("/paste/$user_sha1/149545306873033")->status_is(200)->text_is('header h1', 'paste.txt')
  ->content_like(qr{\<pre\>.*curl -s www}s);

ok !-e $paste, 'legacy paste was moved';
$t->get_ok("/paste/$user_sha1/149545306873033")->status_is(200, '200 OK after moved');

done_testing;

__DATA__
@@ 149545306873033
{"author":"superman@example.com","content":"curl -s www.cpan.org\/modules\/02packages.details.txt","created_at":1495453068.73033}
