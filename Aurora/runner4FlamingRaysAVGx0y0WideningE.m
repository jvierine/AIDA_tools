%% Run all set-up tasks first
if ~exist('started4FlamingRay','var')
  starter4FlamingRayE
  started4FlamingRay = 1;
end
errOps = err4FlamingRaysE;
errOps.bias2cylindrical = 100000000;
errOps.bias2x0y0 = 100000000;

load Istar It3
saveFilename = 'FlamingRay20120124AVGx0y0Widening.mat';

try
  load(saveFilename)
  disp('We are continuing a previous run')
  first_lap = 0;
  if size(It,2) == 15
    It = [It(:,1:10),0*It(:,1),It(:,11:end)];
  end
  errOps.x0y0 = It(12,[2 4])
  parTest(:) = It(12,:)
catch
  disp('We are starting a new run')
  first_lap = 1;
  errOps.x0y0 = It3(12,[2 4])
  parTest(:) = It3(12,:)
end



not_bored_to_tears = 0;
bored_to_tears = 200;
save bored_in_FlamingRay20120124AVGx0y0Widening.mat bored_to_tears

fmsOPS.Display = 'iter';

while not_bored_to_tears < bored_to_tears
  
  load bored_in_FlamingRay20120124AVGx0y0Widening.mat
  not_bored_to_tears = not_bored_to_tears + 1;
  
  fmsOPS.Display = 'iter';
  %% Search for all of them (for this time-step):
  for i1 = 12%:size(ImStack{1},3),
    Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
    stns(1).img = Iq;
    Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
    stns(2).img = Iq;
    %parTest = fminsearch(@(I) err4FlamingRaysE(I,v_p,I0b,stns,{bgMask,bgMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A2Z,A1Z},E,1,110),parTest);
    parTest = fminsearchbnd(@(I) err4FlamingRaysE(I,v_p,I0b,stns,{errMask,errMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A1Z,A2Z},E,1,110,errOps),parTest,parMin,parMax,fmsOPS);
    It(i1,:) = parTest;
    % Here's where we should put saveing of temporary results in!
    save(saveFilename,'It')
    disp(datestr(now,'yyyy mm dd HH:MM:SS'))
    disp([not_bored_to_tears,i1,parTest])
  end
  fmsOPS.Display = 'final';
  %% Then loop forward in time:
  % errOps.bias2cylindrical = 0e6;
  parTest = It(12,:);
  for i1 = 13:size(ImStack{1},3)
    if first_lap == 0
      parTest = It(i1,:);
    end
    Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
    stns(1).img = Iq;
    Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
    stns(2).img = Iq;
    %parTest = fminsearch(@(I) err4FlamingRaysE(I,v_p,I0b,stns,{bgMask,bgMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A2Z,A1Z},E,1,110),parTest);
    parTest = fminsearchbnd(@(I) err4FlamingRaysE(I,v_p,I0b,stns,{errMask,errMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A1Z,A2Z},E,1,110,errOps),parTest,parMin,parMax,fmsOPS);
    It(i1,:) = parTest;
    disp(datestr(now,'yyyy mm dd HH:MM:SS'))
    disp([not_bored_to_tears,i1,parTest])
    % Here's where we should put saveing of temporary results in!
    save(saveFilename,'It')
  end
  %% ...and back to the beginning:
  % errOps.bias2cylindrical = 0e6;
  parTest = It(12,:);
  for i1 = 11:-1:1
    if first_lap == 0
      parTest = It(i1,:);
    end
    Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
    stns(1).img = Iq;
    Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
    stns(2).img = Iq;
    %parTest = fminsearch(@(I) err4FlamingRaysE(I,v_p,I0b,stns,{bgMask,bgMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A2Z,A1Z},E,1,110),parTest);
    parTest = fminsearchbnd(@(I) err4FlamingRaysE(I,v_p,I0b,stns,{errMask,errMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A1Z,A2Z},E,1,110,errOps),parTest,parMin,parMax,fmsOPS);
    It(i1,:) = parTest;
    disp(datestr(now,'yyyy mm dd HH:MM:SS'))
    disp([not_bored_to_tears,i1,parTest])
    % Here's where we should put saveing of temporary results in!
    save(saveFilename,'It')
  end
  first_lap = 0;
  % Here's where we should put post-processing in!
  It = filtfilt([.5 1 .5]/2,1,It);
  It(:,2) = mean(It(:,2));
  It(:,4) = mean(It(:,4));
  parTest = It(12,:);
  errOps.bias2x0y0 = max(100,errOps.bias2x0y0/3);
  errOps.x0y0 = It(12,[2 4]);
  
end


ITC = {It};
%% Model the results: 
for i1 = 1:size(ImStack{1},3)
  Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
  stns(1).img = Iq;
  Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
  stns(2).img = Iq;
  res = err4FlamingRaysE(ITC{end}(i1,:),v_p,I0b,stns,{errMask,errMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A2Z,A1Z},E,2,110,errOps);
  ErrR{1}(i1) = res.err;
  IeRay(i1,:) = res.IeOutput{1};
end

%% Modeling the result:

subplot(4,1,1)
pcolor([1:20]*1/32,E*1e3,log10(IeRay')),shading flat,caxis([-5 0]+max(caxis))
set(gca,'yscale','log')
hold on
xlabel('time (s)')
ylabel('Energy (eV)')
title('Electron spectra')
set(gca,'ytick',[100 1000 10000])
cblh = colorbar_labeled('/eV/m^2/s','log');
set(cblh,'position',get(cblh,'position')+[-0.01 0 0 0])

for i1 = 1:size(ImStack{1},3)
  Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
  stns(1).img = Iq;
  Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
  stns(2).img = Iq;
  res = err4FlamingRaysE(ITC{end}(i1,:),v_p,I0b,stns,{errMask,errMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A1Z,A2Z},E,2,110);
  ErrR{1}(i1) = res.err;
  subplot(4,1,1)
  %semilogy(E,res.IeOutput{1})
  ph = plot((i1+0.5)/32*[1 1],E([1,end])*1e3,'k');
  subplot(4,2,5)
  imagesc(res.currImg{1}),imgs_smart_caxis(0.0003,res.currImg{1}),axis([150 256 150 256]) 
  hold on
  [~,cH1] = contour(res.currProj{1},7,'w');
  hold off
  title('ASK #1 (6730 A)')
  ylabel('Observations')
  colorbar_labeled('R')
  set(gca,'xticklabel','')
  subplot(4,2,6)
  imagesc(res.currImg{2}),imgs_smart_caxis(0.0003,res.currImg{2}),axis([150 256 150 256]) 
  hold on
  [~,cH2] = contour(res.currProj{2},7,'w');
  hold off
  colorbar_labeled('R')
  title('ASK #3 (7774 A)')
  set(gca,'xticklabel','')
  set(gca,'yticklabel','')
  subplot(4,2,7)
  imagesc(res.currProj{1}),imgs_smart_caxis(0.0003,res.currImg{1}),axis([150 256 150 256])
  ylabel('Modeled')
  colorbar_labeled('R')
  subplot(4,2,8)
  imagesc(res.currProj{2}),imgs_smart_caxis(0.0003,res.currImg{2}),axis([150 256 150 256])
  set(gca,'yticklabel','')
  colorbar_labeled('R')
  subplot(4,2,3)
  pcolor(XfI(:,:,400),YfI(:,:,400),res.Vem{1}(:,:,400)),shading flat
  hold on
  xlabel('East of ESR (km)')              
  ylabel('North of ESR (km)')
  title('Horizontal slice at 180 km (6730)')
  %axis equal
  [~,i1_i2(1),i1_i2(2)] = max2D(res.Vem{1}(:,:,400));
  subplot(4,2,4)
  plot(squeeze(res.Vem{1}(i1_i2(1),i1_i2(2),:)),squeeze(ZfI(i1_i2(1),i1_i2(2),:)),'r','linewidth',2)
  hold on
  plot(squeeze(res.Vem{2}(i1_i2(1),i1_i2(2),:)),squeeze(ZfI(i1_i2(1),i1_i2(2),:)),'k','linewidth',2)
  axis([0 4e9 50 400])
  title('Volume emission rate')             
  xlabel('(#/m^3/s)')       
  ylabel('Altitude (km)')    
  hold off
  mRay(i1) = getframe(gcf);
  delete(ph)
end

