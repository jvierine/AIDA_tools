function upd_mirps(src,event,SkMp)
disp(['Key pressed: ', event.Key]);
% You can add logic here based on the key pressed
switch event.Key
  case 'm'
    disp('Magnifying-time!');
  case 'i'
    disp('Identification-to-do');
  case 'r'
    disp('Remove!');
  case 'p'
    disp('Plot stars');
end
end
