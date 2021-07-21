package Convos::Core::Conversation;
use Mojo::Base -base;

use Convos::Util '$CHANNEL_RE';
use Mojo::Date;

has frozen        => '';
has name          => sub { Carp::confess('name required in constructor') };
has password      => '';
has notifications => 0;
has topic         => '';
has unread        => 0;

sub connection { shift->{connection} or Carp::confess('connection required in constructor') }
sub id         { my $from = $_[1] || $_[0]; lc($from->{id} // $from->{name}) }
sub is_private { shift->name =~ /^$CHANNEL_RE/ ? 0 : 1 }

sub inc_unread_p {
  my $self = shift;
  $self->{unread}++;
  return Mojo::Promise->resolve($self);
}

sub inc_notifications { $_[0]->{notifications}++; $_[0] }

sub messages_p {
  my ($self, $query) = @_;
  return $self->connection->user->core->backend->messages_p($self, $query);
}

# back compat - will be removed in future version
sub _calculate_unread_p {
  my $self = shift;
  return unless my $last_read = delete $self->{last_read};
  return $self->messages_p({after => $last_read, limit => 61})
    ->then(sub { $self->unread(int @{shift->{messages}}) });
}

sub TO_JSON {
  my ($self, $persist) = @_;
  my %json = map { ($_, $self->$_) } qw(frozen name topic notifications unread);
  $json{connection_id}   = $self->connection->id;
  $json{conversation_id} = $self->id;
  $json{last_read}       = $self->{last_read} if $self->{last_read};    # back compat
  $json{password}        = $self->password if $persist;
  return \%json;
}

1;

=encoding utf8

=head1 NAME

Convos::Core::Conversation - A convos conversation base class

=head1 DESCRIPTION

L<Convos::Core::Conversation> represents a conversation (conversation) with one or
more participants.

=head1 ATTRIBUTES

=head2 connection

Holds a L<Convos::Core::Connection> object.

=head2 frozen

  $str = $conversation->frozen;

Will be set to a description if the conversation is "frozen", which means you are
no longer part of it.

=head2 id

  $str = $conversation->id;
  $str = $class->id(\%attr);

Returns a unique identifier for a conversation.

=head2 name

  $str = $conversation->name;

The name of this conversation.

=head2 password

  $str = $conversation->password;

The password used to join this conversation.

=head2 topic

  $str = $conversation->topic;

The topic (subject) of the conversation.

=head2 unread

  $int = $conversation->unread;

Holds the number of unread messages.

=head2 notifications

  $int = $conversation->notifications;

Holds the number of unread notifications.

=head1 METHODS

=head2 inc_unread_p

  $p = $conversation->inc_unread_p;

Used to increase the unread count.

=head2 inc_notifications

  $p = $conversation->inc_notifications;

Used to increate the unread notifications count.

=head2 is_private

  $bool = $conversation->is_private;

Returns true if you are only talking to a single user and no other
participants can join the conversation.

=head2 messages_p

  $p = $conversation->messages_p(\%query)->then(sub { my $messages = shift; });

Will fetch messages from persistent backend.

See also L<Convos::Core::Backend/messages>.

=head1 SEE ALSO

L<Convos::Core>.

=cut
