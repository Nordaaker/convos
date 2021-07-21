package Convos::Controller::Conversation;
use Mojo::Base 'Mojolicious::Controller';

use Convos::Date 'dt';
use Mojo::JSON qw(false true);

sub mark_as_read {
  my $self         = shift->openapi->valid_input or return;
  my $conversation = $self->backend->conversation({});

  unless ($conversation) {
    return $self->reply->errors([], 401) unless $self->backend->user;
    return $self->reply->errors('Conversation not found.', 404);
  }

  $conversation->notifications(0)->unread(0);
  $self->stash('connection')->save_p->then(sub {
    $self->render(openapi => {});
  });
}

sub list {
  my $self = shift->openapi->valid_input or return;
  my $user = $self->backend->user or return $self->reply->errors([], 401);
  my @conversations;

  for my $connection (sort { $a->name cmp $b->name } @{$user->connections}) {
    for my $conversation (sort { $a->id cmp $b->id } @{$connection->conversations}) {
      push @conversations, $conversation;
    }
  }

  $self->render(openapi => {conversations => \@conversations});
}

sub messages {
  my $self         = shift->openapi->valid_input or return;
  my $conversation = $self->backend->conversation({});
  my %query;

  unless ($conversation) {
    return $self->reply->errors([], 401) unless $self->backend->user;
    return $self->render(openapi => {messages => [], end => true});
  }

  $query{$_} = $self->param($_)
    for grep { defined $self->param($_) } qw(after around before level limit match);
  $query{limit} ||= $query{after} && $query{before} ? 200 : 60;
  $query{limit} = 200 if $query{limit} > 200;

  # Input check
  if ($query{after} and $query{before}) {
    return $self->reply->errors([['Must be before "/after".', '/before']], 400)
      if dt($query{after}) > dt($query{before});
    return $self->reply->errors([['Must be less than "/after" - 12 months.', '/before']], 400)
      if abs(dt($query{after}) - dt($query{before})) > 86400 * 365;
  }

  $conversation->messages_p(\%query)->then(sub { $self->render(openapi => shift) });
}

1;

=encoding utf8

=head1 NAME

Convos::Controller::Conversation - Convos conversations

=head1 DESCRIPTION

L<Convos::Controller::Conversation> is a L<Mojolicious::Controller> with
conversation related actions.

=head1 METHODS

=head2 list

See L<https://convos.chat/api.html#op-get--conversations>

=head2 mark_as_read

See L<https://convos.chat/api.html#op-post--connection--connection_id--conversation--conversation_id--read>

=head2 messages

See L<https://convos.chat/api.html#op-get--connection--connection_id--conversation--conversation_id--messages>

=head1 SEE ALSO

L<Convos>.

=cut
