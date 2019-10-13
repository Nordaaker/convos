#!perl
use lib '.';
use t::Helper;

$ENV{CONVOS_BACKEND}           = 'Convos::Core::Backend';
$ENV{CONVOS_FORCED_IRC_SERVER} = 'chat.example.com:1234';
my $t = t::Helper->t;

$t->post_ok(
  '/api/user/register',
  json => {
    email       => 'superman@example.com',
    invite_code => $ENV{CONVOS_INVITE_CODE},
    password    => 's3cret'
  }
)->status_is(200);

$t->post_ok('/api/connections', json => {url => 'irc://irc.perl.org'})->status_is(400);
$t->post_ok('/api/connections', json => {url => 'irc://chat.freenode.net'})->status_is(400)
  ->json_is('/errors/0/message', 'Will only accept forced connection URL.');

$t->get_ok('/api/connections')->status_is(200)
  ->json_is('/connections/0/connection_id', 'irc-example')
  ->json_is('/connections/0/name',          'example')
  ->json_is('/connections/0/url',           'irc://chat.example.com:1234?nick=superman');

# The new URL will be ignored
$t->post_ok('/api/connection/irc-example', json => {url => 'irc://irc.perl.org'})->status_is(200);

$t->get_ok('/api/connections')->status_is(200)
  ->json_is('/connections/0/connection_id', 'irc-example')
  ->json_is('/connections/0/name',          'example')
  ->json_is('/connections/0/url',           'irc://chat.example.com:1234?nick=superman');

done_testing;
