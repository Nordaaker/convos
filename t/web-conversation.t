#!perl
use lib '.';
use t::Helper;
use Mojo::Loader qw(data_section);
use Mojo::Util qw(encode);

my $t    = t::Helper->t;
my $user = $t->app->core->user({email => 'superman@example.com'})->set_password('s3cret');
$user->save_p->$wait_success('save_p');

$t->post_ok('/api/user/login', json => {email => 'superman@example.com', password => 's3cret'})
  ->status_is(200);

$user->connection({url => 'irc://localhost'})->state(connected => '');

my $connection = $user->connection({url => 'irc://localhost'});
$connection->_irc_event_privmsg({
  command => 'privmsg',
  prefix  => 'Supergirl!super.girl@i.love.debian.org',
  params  => ['#Convos', 'not a superdupersuperman?']
});
$connection->conversation({name => '#Convos', frozen => ''})->unread(42);
$t->get_ok('/api/conversations')->status_is(200)->json_is(
  '/conversations' => [
    {
      connection_id   => 'irc-localhost',
      conversation_id => '#convos',
      frozen          => '',
      name            => '#Convos',
      topic           => '',
      unread          => 42,
      notifications   => 0,
    },
  ]
);

$connection->conversation({name => '#Notified', frozen => ''})->notifications(2);
$t->get_ok('/api/conversations')->status_is(200)->json_is(
  '/conversations' => [
    {
      connection_id   => 'irc-localhost',
      conversation_id => '#convos',
      frozen          => '',
      name            => '#Convos',
      topic           => '',
      unread          => 42,
      notifications   => 0,
    },
    {
      connection_id   => 'irc-localhost',
      conversation_id => '#notified',
      frozen          => '',
      name            => '#Notified',
      topic           => '',
      unread          => 0,
      notifications   => 2,
    },
  ]
);


$user->connection({url => 'irc://example'})->conversation({name => '#superheroes', frozen => ''})
  ->unread(34);
$t->get_ok('/api/user?connections=true&conversations=true')->status_is(200)->json_is(
  '/connections',
  [
    {
      connection_id       => 'irc-example',
      me                  => {authenticated => false, capabilities => {}},
      name                => 'example',
      on_connect_commands => [],
      service_accounts    => [qw(chanserv nickserv)],
      state               => 'queued',
      url                 => 'irc://example',
      wanted_state        => 'connected',
    },
    {
      connection_id       => 'irc-localhost',
      me                  => {authenticated => false, capabilities => {}},
      name                => 'localhost',
      on_connect_commands => [],
      service_accounts    => [qw(chanserv nickserv)],
      state               => 'connected',
      url                 => 'irc://localhost',
      wanted_state        => 'connected',
    }
  ],
  'user connections'
)->json_is(
  '/conversations',
  [
    {
      connection_id   => 'irc-localhost',
      conversation_id => '#convos',
      frozen          => '',
      name            => '#Convos',
      topic           => '',
      unread          => 42,
      notifications   => 0,
    },
    {
      connection_id   => 'irc-localhost',
      conversation_id => '#notified',
      frozen          => '',
      name            => '#Notified',
      topic           => '',
      unread          => 0,
      notifications   => 2,
    },
    {
      connection_id   => 'irc-example',
      conversation_id => '#superheroes',
      frozen          => '',
      name            => '#superheroes',
      topic           => '',
      unread          => 34,
      notifications   => 0,
    }
  ],
  'user conversations'
)->json_hasnt('/notifications', 'user notifications');

$t->post_ok('/api/connection/irc-localhost/conversation/%23convos/read')->status_is(200);

note 'notifications';
$t->get_ok('/api/notifications')->status_is(200)->json_is('/messages', []);
my $backend = $t->app->core->backend;
my $target  = $connection->get_conversation('#convos');
for (split /\n/, data_section qw(main notifications.log)) {
  my ($ts, $message) = split /\s/, $_, 2;
  $message = encode 'UTF-8', $message if utf8::is_utf8($message);
  $backend->_add_notification($target, $ts, $message);
}

$t->get_ok('/api/notifications')->status_is(200);
is @{$t->tx->res->json->{messages}}, 5, 'got all notifications, including utf8';

note 'channel with dot';
$user->connection({url => 'irc://example'})->conversation({name => '#a.js', frozen => ''});
$t->get_ok('/api/user?connections=true&conversations=true')->status_is(200)
  ->json_is('/conversations/0/name', '#a.js');
$t->get_ok('/chat/irc-libera/%23convos')->status_is(200);
$t->get_ok('/chat/irc-libera/%23a.js')->status_is(200);

done_testing;

__DATA__
@@ notifications.log
2020-12-03T11:25:18 <superman> cool beans
2020-12-03T11:26:39 <supergirl> even with ø and å?
2020-12-03T12:13:34 <supergirl> not sure...
2020-12-03T12:14:07 <superman> have to wait!
2020-12-03T12:58:57 <supergirl> øøøøøøh!
