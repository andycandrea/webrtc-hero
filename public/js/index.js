var $roomButton = $('#join-room');

$roomButton.on('click', function() {
  window.location.pathname = $('#room-name').val();
});
